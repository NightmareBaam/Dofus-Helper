import { existsSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { resolveDataFile, resolveRuntimeRoot } from "./runtimePaths.js";

export interface ToastNotificationRecord {
  id: number;
  app: string;
  createdAt?: string;
  title: string;
  body: string;
}

export interface ToastNotificationsSnapshot {
  access: string;
  notifications: ToastNotificationRecord[];
}

const HELPER_START_TIMEOUT_MS = 15000;
const HELPER_STALE_AFTER_MS = 4000;

let helperProcess: ChildProcess | null = null;
let helperLineBuffer = "";
let helperReadyPromise: Promise<void> | null = null;
let helperDisabled = false;
let latestSnapshot: ToastNotificationsSnapshot = { access: "Starting", notifications: [] };
let latestSnapshotAt = 0;

function normalizeSnapshot(value: unknown): ToastNotificationsSnapshot {
  type NotificationCandidate = {
    id?: number;
    Id?: number;
    app?: string;
    App?: string;
    createdAt?: string;
    CreatedAt?: string;
    title?: string;
    Title?: string;
    body?: string;
    Body?: string;
    text?: string[];
    Text?: string[];
  };

  const candidate = (typeof value === "object" && value !== null ? value : {}) as {
    access?: string;
    Access?: string;
    notifications?: NotificationCandidate[];
    Notifications?: NotificationCandidate[];
  };
  const notifications: NotificationCandidate[] = Array.isArray(candidate.notifications)
    ? candidate.notifications
    : Array.isArray(candidate.Notifications)
      ? candidate.Notifications
      : [];

  return {
    access: String(candidate.access ?? candidate.Access ?? "Unknown"),
    notifications: notifications.map((item) => ({
      id: Number(item.id ?? item.Id ?? 0),
      app: String(item.app ?? item.App ?? ""),
      createdAt: String(item.createdAt ?? item.CreatedAt ?? ""),
      title: Array.isArray(item.text ?? item.Text)
        ? String((item.text ?? item.Text)?.[0] ?? "")
        : String(item.title ?? item.Title ?? ""),
      body: Array.isArray(item.text ?? item.Text)
        ? String(((item.text ?? item.Text) ?? []).slice(1).join(" | "))
        : String(item.body ?? item.Body ?? ""),
    })),
  };
}

function resolveHelperCandidates(): string[] {
  const configured = process.env.DOFUS_HELPER_NOTIFICATIONS_HELPER_PATH?.trim();
  const root = resolveRuntimeRoot();
  return [
    configured,
    resolve(root, "src-tauri", "resources", "notifications-helper", "notification-reader.exe"),
    resolve(root, "src-tauri", "resources", "notifications-helper", "notifications-helper.exe"),
    resolve(root, "native", "notifications-helper", "publish", "NotificationReader.exe"),
    resolve(root, "native", "notifications-helper", "publish", "NotificationsHelper.exe"),
    resolve(root, "notifications-helper", "notification-reader.exe"),
    resolve(root, "notifications-helper", "notifications-helper.exe"),
  ].filter((value): value is string => Boolean(value));
}

function resolveHelperPath(): string | null {
  const candidates = resolveHelperCandidates();

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function handleHelperStdout(chunk: string): void {
  helperLineBuffer += chunk;
  const lines = helperLineBuffer.split(/\r?\n/);
  helperLineBuffer = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      latestSnapshot = normalizeSnapshot(JSON.parse(trimmed));
      latestSnapshotAt = Date.now();
    } catch {
      // Ignore malformed lines and keep last valid snapshot.
    }
  }
}

async function ensureHelperStarted(): Promise<boolean> {
  if (helperDisabled) {
    return false;
  }

  if (helperProcess && helperProcess.exitCode === null) {
    return true;
  }

  const helperPath = resolveHelperPath();
  if (!helperPath) {
    helperDisabled = true;
    console.error(`[notifications-helper] helper missing, searched: ${resolveHelperCandidates().join(" | ")}`);
    latestSnapshot = { access: "Unavailable:HelperMissing", notifications: [] };
    return false;
  }

  if (!helperReadyPromise) {
    helperReadyPromise = new Promise<void>((resolveReady, rejectReady) => {
      const child = spawn(helperPath, ["watch", "1500"], {
        cwd: dirname(helperPath),
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          DOFUS_HELPER_NOTIFICATIONS_LOG_PATH: resolveDataFile("notifications-helper.log"),
          DOFUS_HELPER_NOTIFICATIONS_DEBUG: process.env.DOFUS_HELPER_NOTIFICATIONS_DEBUG?.trim() || "0",
        },
      });

      helperProcess = child;
      helperLineBuffer = "";

      const timeoutId = setTimeout(() => {
        child.kill();
        rejectReady(new Error(`Le helper notifications n'a pas fourni de snapshot initial (${helperPath}).`));
      }, HELPER_START_TIMEOUT_MS);

      const completeReady = (): void => {
        clearTimeout(timeoutId);
        resolveReady();
      };

      child.stdout.on("data", (chunk: Buffer) => {
        handleHelperStdout(chunk.toString());
        if (latestSnapshotAt > 0) {
          completeReady();
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const message = chunk.toString().trim();
        if (message) {
          console.error(`[notifications-helper] ${message}`);
        }
      });

      child.on("error", (error: Error) => {
        clearTimeout(timeoutId);
        helperProcess = null;
        helperReadyPromise = null;
        rejectReady(error);
      });

      child.on("exit", (code, signal) => {
        clearTimeout(timeoutId);
        helperProcess = null;
        helperReadyPromise = null;
        if (code !== 0 && code !== null) {
          console.error(`[notifications-helper] process exited (code=${code}, signal=${signal ?? "null"})`);
        }
      });
    }).catch(() => {
      latestSnapshot = { access: "Unavailable:HelperStartupFailed", notifications: [] };
      helperReadyPromise = null;
      return Promise.reject(new Error("Notifications helper unavailable"));
    });
  }

  try {
    await helperReadyPromise;
    return true;
  } catch {
    return false;
  }
}

export async function fetchToastNotifications(): Promise<ToastNotificationsSnapshot> {
  if (await ensureHelperStarted()) {
    return latestSnapshot;
  }

  if (latestSnapshotAt > 0 && (Date.now() - latestSnapshotAt) <= HELPER_STALE_AFTER_MS) {
    return latestSnapshot;
  }

  return latestSnapshot;
}
