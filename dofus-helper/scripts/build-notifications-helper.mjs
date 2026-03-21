import { spawn } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = process.cwd();
const projectFile = resolve(rootDir, "native", "notifications-helper", "NotificationsHelper.csproj");
const outputDir = resolve(rootDir, "native", "notifications-helper", "publish");
const tempOutputDir = resolve(rootDir, "native", "notifications-helper", `.publish-${Date.now()}`);
const runtime = process.arch === "arm64" ? "win-arm64" : "win-x64";

if (!existsSync(projectFile)) {
  throw new Error(`Notifications helper project not found: ${projectFile}`);
}

await stopRunningHelpers();

rmSync(tempOutputDir, { recursive: true, force: true });
mkdirSync(tempOutputDir, { recursive: true });

await run("dotnet", [
  "publish",
  projectFile,
  "-c",
  "Release",
  "-r",
  runtime,
  "--self-contained",
  "true",
  "/p:PublishSingleFile=false",
  "/p:PublishTrimmed=false",
  "-o",
  tempOutputDir,
]);

rmSync(outputDir, { recursive: true, force: true });
renameSync(tempOutputDir, outputDir);

console.log(`[build-notifications-helper] published to ${outputDir}`);

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: rootDir, stdio: "inherit", windowsHide: true });
    child.on("exit", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`${command} exited with code ${code ?? "null"}`));
    });
    child.on("error", rejectRun);
  });
}

async function stopRunningHelpers() {
  await runOptional("taskkill", ["/IM", "NotificationReader.exe", "/F"]);
  await runOptional("taskkill", ["/IM", "NotificationsHelper.exe", "/F"]);
  await new Promise((resolveWait) => setTimeout(resolveWait, 250));
}

function runOptional(command, args) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { cwd: rootDir, stdio: "ignore", windowsHide: true });
    child.on("exit", () => resolveRun());
    child.on("error", () => resolveRun());
  });
}
