import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";

const rootDir = process.cwd();
const sourceBinary = process.execPath;
const targetTriple = resolveTargetTriple(process.platform, process.arch);
const extension = process.platform === "win32" ? ".exe" : "";
const targetDirectory = resolve(rootDir, "src-tauri", "binaries");
const targetBinary = resolve(targetDirectory, `backend-${targetTriple}${extension}`);

mkdirSync(targetDirectory, { recursive: true });
copyFileSync(sourceBinary, targetBinary);

if (process.platform !== "win32") {
  chmodSync(targetBinary, 0o755);
}

console.log(`[prepare-sidecar] ${basename(sourceBinary)} -> ${targetBinary}`);

function resolveTargetTriple(platform, arch) {
  const key = `${platform}:${arch}`;
  const knownTriples = {
    "win32:x64": "x86_64-pc-windows-msvc",
    "win32:arm64": "aarch64-pc-windows-msvc",
    "linux:x64": "x86_64-unknown-linux-gnu",
    "linux:arm64": "aarch64-unknown-linux-gnu",
    "darwin:x64": "x86_64-apple-darwin",
    "darwin:arm64": "aarch64-apple-darwin",
  };
  const target = knownTriples[key];
  if (!target) {
    throw new Error(`Unsupported sidecar target: ${key}`);
  }
  return target;
}
