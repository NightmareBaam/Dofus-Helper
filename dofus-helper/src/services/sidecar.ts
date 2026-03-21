import { appLocalDataDir, resolveResource } from "@tauri-apps/api/path";
import { Command, type Child } from "@tauri-apps/plugin-shell";

const BACKEND_URL = "http://127.0.0.1:3210/api/system/health";
const SIDECAR_NAMES = ["binaries/backend", "backend"] as const;
const SIDE_CAR_BOOT_TIMEOUT_MS = 15000;
const SIDE_CAR_POLL_INTERVAL_MS = 250;

let backendReadyPromise: Promise<void> | null = null;
let sidecarChild: Child | null = null;

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function canReachBackend(timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(BACKEND_URL, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function waitForBackend(deadlineMs: number): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (await canReachBackend(900)) {
      return;
    }
    await new Promise((resolve) => window.setTimeout(resolve, SIDE_CAR_POLL_INTERVAL_MS));
  }
  throw new Error("Le sidecar backend Node n'a pas repondu a temps.");
}

async function resolveBundledResource(...candidates: string[]): Promise<string> {
  for (const candidate of candidates) {
    try {
      return await resolveResource(candidate);
    } catch {
      // Continue until one candidate resolves.
    }
  }
  throw new Error(`Ressource introuvable: ${candidates.join(" | ")}`);
}

async function spawnSidecar(): Promise<void> {
  if (sidecarChild) {
    return;
  }

  const [serverEntry, catalogDirectory, assetsDirectory, dataDirectory, notificationsHelperPath] = await Promise.all([
    resolveBundledResource("_up_/backend/dist/server.js", "backend/dist/server.js", "../backend/dist/server.js"),
    resolveBundledResource("_up_/_up_/bdd_items", "_up_/bdd_items", "../../bdd_items", "../bdd_items", "bdd_items"),
    resolveBundledResource("_up_/_up_/assets", "_up_/assets", "../../assets", "../assets", "assets").catch(() => ""),
    appLocalDataDir(),
    resolveBundledResource(
      "resources/notifications-helper/notification-reader.exe",
      "resources/notifications-helper/notifications-helper.exe",
      "../resources/notifications-helper/notification-reader.exe",
      "../resources/notifications-helper/notifications-helper.exe",
      "notifications-helper/notification-reader.exe",
      "notifications-helper/notifications-helper.exe",
    ).catch(() => ""),
  ]);

  const env = {
    DOFUS_HELPER_BACKEND_PORT: "3210",
    DOFUS_HELPER_CATALOG_DIR: catalogDirectory,
    ...(assetsDirectory ? { DOFUS_HELPER_ASSETS_DIR: assetsDirectory } : {}),
    DOFUS_HELPER_DATA_DIR: dataDirectory,
    ...(notificationsHelperPath ? { DOFUS_HELPER_NOTIFICATIONS_HELPER_PATH: notificationsHelperPath } : {}),
  };

  let lastError: unknown = null;
  for (const sidecarName of SIDECAR_NAMES) {
    try {
      const command = Command.sidecar(sidecarName, [serverEntry], { env });

      command.on("error", (message) => {
        console.error(`[sidecar:${sidecarName}] command error:`, message);
      });
      command.on("close", (payload) => {
        console.info(`[sidecar:${sidecarName}] stopped`, payload);
        sidecarChild = null;
      });
      command.stderr.on("data", (chunk) => {
        const message = String(chunk).trim();
        if (message) {
          console.error(`[sidecar:${sidecarName}]`, message);
        }
      });

      console.info("[sidecar] starting", {
        sidecarName,
        serverEntry,
        catalogDirectory,
        assetsDirectory,
        notificationsHelperPath,
      });
      sidecarChild = await command.spawn();
      return;
    } catch (error) {
      lastError = error;
      console.error(`[sidecar:${sidecarName}] spawn failed`, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Impossible de lancer le sidecar backend.");
}

export async function ensureBackendReady(): Promise<void> {
  if (import.meta.env.DEV || !isTauriRuntime()) {
    return;
  }

  if (await canReachBackend(700)) {
    return;
  }

  if (!backendReadyPromise) {
    backendReadyPromise = (async () => {
      await spawnSidecar();
      await waitForBackend(SIDE_CAR_BOOT_TIMEOUT_MS);
    })().catch((error) => {
      backendReadyPromise = null;
      throw error;
    });
  }

  await backendReadyPromise;
}
