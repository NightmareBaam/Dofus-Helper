import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = process.cwd();
const sourceDir = resolve(rootDir, "native", "notifications-helper", "publish");
const sourceFile = resolve(sourceDir, "NotificationReader.exe");
const resourcesDir = resolve(rootDir, "src-tauri", "resources");
const placeholderFile = resolve(resourcesDir, "placeholder.txt");
const targetDir = resolve(resourcesDir, "notifications-helper");
const targetExe = resolve(targetDir, "notification-reader.exe");
const targetOriginalExe = resolve(targetDir, "NotificationReader.exe");
const legacyTargetExe = resolve(targetDir, "notifications-helper.exe");

mkdirSync(resourcesDir, { recursive: true });
writeFileSync(placeholderFile, "Reserved for bundled runtime resources.\n");

rmSync(targetDir, { recursive: true, force: true });

if (!existsSync(sourceFile)) {
  console.log(`[prepare-notifications-helper] skipped (${sourceFile} missing)`);
  process.exit(0);
}

mkdirSync(targetDir, { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true, force: true });
if (existsSync(targetOriginalExe)) {
  rmSync(targetExe, { force: true });
  renameSync(targetOriginalExe, targetExe);
}
cpSync(targetExe, legacyTargetExe, { force: true });

console.log(`[prepare-notifications-helper] ${sourceDir} -> ${targetDir}`);
