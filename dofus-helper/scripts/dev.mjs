import { spawn } from "node:child_process";
import { resolve } from "node:path";

const rootDir = process.cwd();
const nodeBin = process.execPath;
const viteCli = resolve(rootDir, "node_modules", "vite", "bin", "vite.js");
const backendDevScript = resolve(rootDir, "scripts", "backend-dev.mjs");
const tscCli = resolve(rootDir, "node_modules", "typescript", "bin", "tsc");
const buildNotificationsHelperScript = resolve(rootDir, "scripts", "build-notifications-helper.mjs");
const prepareNotificationsHelperScript = resolve(rootDir, "scripts", "prepare-notifications-helper.mjs");

const children = [];
let shuttingDown = false;

function startProcess(label, command, args, env = process.env) {
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    env,
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    console.error(`[dev-stack] ${label} stopped (code=${code ?? "null"}, signal=${signal ?? "null"})`);
    void shutdown(code ?? 1);
  });

  children.push(child);
  return child;
}

function runCommand(label, command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      windowsHide: true,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`${label} failed with code ${code ?? "null"}`));
    });

    child.on("error", rejectRun);
  });
}

async function commandExists(command, args = ["--version"]) {
  return new Promise((resolveCheck) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "ignore",
      windowsHide: true,
    });

    child.on("exit", (code) => resolveCheck(code === 0));
    child.on("error", () => resolveCheck(false));
  });
}

async function primeDevStack() {
  const hasDotnet = await commandExists("dotnet");
  if (hasDotnet) {
    await runCommand("notifications helper build", nodeBin, [buildNotificationsHelperScript]);
  }
  await runCommand("notifications helper prepare", nodeBin, [prepareNotificationsHelperScript]);
  await runCommand("backend build", nodeBin, [tscCli, "-p", "backend/tsconfig.json"]);
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  for (const child of children) {
    if (child.exitCode === null) {
      child.kill();
    }
  }

  setTimeout(() => process.exit(exitCode), 100);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void shutdown(0);
  });
}

await primeDevStack();

startProcess("backend", nodeBin, [backendDevScript], {
  ...process.env,
  DOFUS_HELPER_BACKEND_DEV_SKIP_INITIAL: "1",
});
startProcess("frontend", nodeBin, [viteCli, "--host"]);
