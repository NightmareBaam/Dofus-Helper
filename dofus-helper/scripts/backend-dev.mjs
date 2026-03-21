import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { resolve } from "node:path";

const rootDir = process.cwd();
const nodeBin = process.execPath;
const tscCli = resolve(rootDir, "node_modules", "typescript", "bin", "tsc");
const buildNotificationsHelperScript = resolve(rootDir, "scripts", "build-notifications-helper.mjs");
const prepareNotificationsHelperScript = resolve(rootDir, "scripts", "prepare-notifications-helper.mjs");
const serverEntry = resolve(rootDir, "backend", "dist", "server.js");
const watchTargets = [
  { path: resolve(rootDir, "backend", "src"), reason: "backend change", helper: false },
  { path: resolve(rootDir, "backend", "tsconfig.json"), reason: "backend config change", helper: false },
  { path: resolve(rootDir, "native", "notifications-helper"), reason: "notifications helper change", helper: true },
];

let serverProcess = null;
let shuttingDown = false;
let buildInFlight = false;
let rebuildQueued = false;
let debounceHandle = null;
let dotnetAvailable = null;
let dotnetMissingLogged = false;
let notificationsHelperDirty = true;

function log(message) {
  console.log(`[backend-dev] ${message}`);
}

function shouldIgnoreHelperChange(filename) {
  if (!filename) {
    return false;
  }

  const normalized = String(filename).replace(/\\/g, "/").toLowerCase();
  return normalized.startsWith("publish/")
    || normalized.startsWith("bin/")
    || normalized.startsWith("obj/")
    || normalized.includes("/publish/")
    || normalized.includes("/bin/")
    || normalized.includes("/obj/");
}

function runCommand(command, args) {
  return new Promise((resolveCommand) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("exit", (code) => resolveCommand(code ?? 1));
    child.on("error", () => resolveCommand(1));
  });
}

function runBuild() {
  return runCommand(nodeBin, [tscCli, "-p", "backend/tsconfig.json"]);
}

function probeDotnet() {
  return new Promise((resolveProbe) => {
    const probe = spawn("dotnet", ["--version"], {
      cwd: rootDir,
      stdio: "ignore",
      windowsHide: true,
    });

    probe.on("exit", (code) => resolveProbe(code === 0));
    probe.on("error", () => resolveProbe(false));
  });
}

async function ensureDotnetAvailable() {
  if (dotnetAvailable !== null) {
    return dotnetAvailable;
  }

  dotnetAvailable = await probeDotnet();
  if (!dotnetAvailable && !dotnetMissingLogged) {
    dotnetMissingLogged = true;
    log("dotnet not found, notifications helper build skipped");
  }
  return dotnetAvailable;
}

async function buildNotificationsHelperIfNeeded() {
  if (!notificationsHelperDirty) {
    return true;
  }

  const hasDotnet = await ensureDotnetAvailable();
  if (hasDotnet) {
    log("building notifications helper");
    const helperBuildCode = await runCommand(nodeBin, [buildNotificationsHelperScript]);
    if (helperBuildCode !== 0) {
      log(`notifications helper build failed with code ${helperBuildCode}`);
    }
  }

  const prepareCode = await runCommand(nodeBin, [prepareNotificationsHelperScript]);
  if (prepareCode !== 0) {
    log(`notifications helper prepare failed with code ${prepareCode}`);
  }

  notificationsHelperDirty = false;
  return true;
}

function stopServer() {
  return new Promise((resolveStop) => {
    if (!serverProcess || serverProcess.exitCode !== null) {
      serverProcess = null;
      resolveStop();
      return;
    }

    const current = serverProcess;
    current.once("exit", () => {
      if (serverProcess === current) {
        serverProcess = null;
      }
      resolveStop();
    });
    current.kill();
  });
}

async function restartServer() {
  await stopServer();
  if (shuttingDown) {
    return;
  }

  log("starting sidecar server");
  serverProcess = spawn(nodeBin, [serverEntry], {
    cwd: rootDir,
    stdio: "inherit",
  });

  serverProcess.on("exit", (code, signal) => {
    if (serverProcess?.exitCode !== null) {
      serverProcess = null;
    }

    if (!shuttingDown && code !== 0) {
      log(`server stopped unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"})`);
    }
  });
}

async function buildAndRestart(reason) {
  if (buildInFlight) {
    rebuildQueued = true;
    return;
  }

  buildInFlight = true;
  log(`building backend (${reason})`);
  if (notificationsHelperDirty) {
    await stopServer();
  }
  await buildNotificationsHelperIfNeeded();
  const code = await runBuild();
  buildInFlight = false;

  if (code === 0) {
    await restartServer();
  } else {
    log(`build failed with code ${code}`);
  }

  if (rebuildQueued && !shuttingDown) {
    rebuildQueued = false;
    await buildAndRestart("queued change");
  }
}

function scheduleBuild(reason) {
  if (debounceHandle) {
    clearTimeout(debounceHandle);
  }
  debounceHandle = setTimeout(() => {
    debounceHandle = null;
    void buildAndRestart(reason);
  }, 150);
}

const watchers = watchTargets.map((target) =>
  watch(target.path, { recursive: true }, (_eventType, filename) => {
    if (!shuttingDown) {
      if (target.helper && shouldIgnoreHelperChange(filename)) {
        return;
      }
      if (target.helper) {
        notificationsHelperDirty = true;
      }
      scheduleBuild(target.reason);
    }
  }),
);

async function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  watchers.forEach((watcher) => watcher.close());
  if (debounceHandle) {
    clearTimeout(debounceHandle);
  }
  await stopServer();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void shutdown().finally(() => process.exit(0));
  });
}

if (process.env.DOFUS_HELPER_BACKEND_DEV_SKIP_INITIAL === "1") {
  void restartServer();
} else {
  void buildAndRestart("initial start");
}
