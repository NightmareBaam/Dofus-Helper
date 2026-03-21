import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ensureCharacterRule, getCharactersConfig, type CharacterNotifType } from "./charactersStorage.js";
import { countGameWindows, extractPseudoFromTitle, focusGameType, focusPseudo, isUnityNotificationTitle, listGameWindows } from "./gameWindows.js";
import { fetchToastNotifications } from "./notificationsBridge.js";
import { resolveDataFile } from "./runtimePaths.js";
import { copyTextToClipboard } from "./windowsBridge.js";

export interface AutofocusLogEntry {
  id: number;
  timestamp: string;
  message: string;
  tag: string;
}

export interface AutofocusStats {
  notifications: string;
  matches: string;
  focus: string;
  last: string;
}

export interface AutofocusState {
  available: boolean;
  running: boolean;
  debugEnabled: boolean;
  enabledTypes: Record<CharacterNotifType, boolean>;
  stats: AutofocusStats;
  accessStatus: string;
  logs?: AutofocusLogEntry[];
}

interface PersistedAutofocusConfig {
  debugEnabled: boolean;
  enabledTypes: Record<CharacterNotifType, boolean>;
}

const POLL_INTERVAL_MS = 900;
const MAX_LOGS = 300;
const MAX_SEEN_IDS = 500;
const NOTIFICATION_PATTERNS: Array<{ type: CharacterNotifType; patterns: string[] }> = [
  { type: "combat", patterns: ["de jouer"] },
  { type: "echange", patterns: ["te propose de faire un echange"] },
  { type: "groupe", patterns: ["t'invite", "t'invite a rejoindre son groupe", "rejoindre son groupe", "invite a rejoindre son groupe"] },
  { type: "mp", patterns: ["de ", "(prive)"] },
];
const MP_SENDER_PATTERN = /^\s*(?:de\s+|\((?:prive|privé)\)\s+)(?<sender>[^:]+?)\s*:/i;

function defaultEnabledTypes(): Record<CharacterNotifType, boolean> {
  return {
    combat: true,
    echange: true,
    groupe: true,
    mp: true,
  };
}

function defaultPersistedConfig(): PersistedAutofocusConfig {
  return {
    debugEnabled: false,
    enabledTypes: defaultEnabledTypes(),
  };
}

function defaultStats(): AutofocusStats {
  return {
    notifications: "0",
    matches: "0",
    focus: "0",
    last: "-",
  };
}

function resolveStorageFilePath(): string {
  return resolveDataFile("autofocus.json");
}

function normalizePersistedConfig(value: unknown): PersistedAutofocusConfig {
  if (typeof value !== "object" || value === null) {
    return defaultPersistedConfig();
  }
  const candidate = value as Record<string, unknown>;
  const enabledTypes = defaultEnabledTypes();
  for (const type of Object.keys(enabledTypes) as CharacterNotifType[]) {
    enabledTypes[type] = candidate.enabledTypes && typeof candidate.enabledTypes === "object"
      ? ((candidate.enabledTypes as Record<string, unknown>)[type] !== false)
      : true;
  }
  return {
    debugEnabled: candidate.debugEnabled === true,
    enabledTypes,
  };
}

function readPersistedConfig(): PersistedAutofocusConfig {
  const filePath = resolveStorageFilePath();
  if (!existsSync(filePath)) {
    return defaultPersistedConfig();
  }
  try {
    return normalizePersistedConfig(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    return defaultPersistedConfig();
  }
}

function writePersistedConfig(config: PersistedAutofocusConfig): PersistedAutofocusConfig {
  const filePath = resolveStorageFilePath();
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(config, null, 2), "utf8");
  return normalizePersistedConfig(config);
}

function timestamp(): string {
  return new Date().toLocaleTimeString("fr-FR", { hour12: false });
}

function normalizeText(value: string): string {
  return value
    .replace(/[’`´]/g, "'")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function detectNotificationType(body: string): CharacterNotifType | null {
  const normalizedBody = normalizeText(body);
  for (const entry of NOTIFICATION_PATTERNS) {
    if (entry.patterns.some((pattern) => normalizedBody.includes(normalizeText(pattern)))) {
      return entry.type;
    }
  }
  return null;
}

function extractMpSender(body: string): string | null {
  const match = MP_SENDER_PATTERN.exec(body.trim());
  const sender = match?.groups?.sender?.trim() ?? "";
  return sender || null;
}

class AutoFocusService {
  private persistedConfig = readPersistedConfig();
  private logs: AutofocusLogEntry[] = [];
  private logSeq = 0;
  private stats: AutofocusStats = defaultStats();
  private seenNotificationIds = new Set<number>();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private pollInFlight = false;
  private available = true;
  private running = false;
  private accessStatus = "Unknown";
  private lastErrorMessage = "";
  private lastAccessWarning = "";

  constructor() {
    this.syncRunningState(false);
  }

  getState(includeLogs: boolean): AutofocusState {
    return {
      available: this.available,
      running: this.running,
      debugEnabled: this.persistedConfig.debugEnabled,
      enabledTypes: { ...this.persistedConfig.enabledTypes },
      stats: { ...this.stats },
      accessStatus: this.accessStatus,
      logs: includeLogs ? [...this.logs] : undefined,
    };
  }

  poll(lastLogId: number): { logs: AutofocusLogEntry[]; state: AutofocusState } {
    return {
      logs: this.logs.filter((entry) => entry.id > lastLogId),
      state: this.getState(false),
    };
  }

  setTypeEnabled(notifType: string, enabled: boolean): AutofocusState {
    if (!Object.prototype.hasOwnProperty.call(this.persistedConfig.enabledTypes, notifType)) {
      throw new Error("Type AutoFocus invalide.");
    }
    this.persistedConfig.enabledTypes[notifType as CharacterNotifType] = enabled;
    this.persistedConfig = writePersistedConfig(this.persistedConfig);
    this.appendLog(`[${notifType}] ${enabled ? "active" : "desactive"}.`, enabled ? `type_${notifType}` : "dim");
    this.syncRunningState(true);
    return this.getState(false);
  }

  setDebug(enabled: boolean): AutofocusState {
    this.persistedConfig.debugEnabled = enabled;
    this.persistedConfig = writePersistedConfig(this.persistedConfig);
    this.appendLog(enabled ? "Mode debug AutoFocus actif." : "Mode debug AutoFocus desactive.", enabled ? "debug" : "dim");
    this.syncRunningState(false);
    return this.getState(false);
  }

  private hasEnabledType(): boolean {
    return Object.values(this.persistedConfig.enabledTypes).some(Boolean);
  }

  private syncRunningState(logOnStartStop: boolean): void {
    if (this.hasEnabledType()) {
      if (!this.running) {
        this.start(logOnStartStop);
      }
      return;
    }
    if (this.running) {
      this.stop(logOnStartStop ? "AutoFocus stoppee (aucun type actif)." : null);
    }
  }

  private start(logMessage: boolean): void {
    if (this.running) {
      return;
    }
    this.running = true;
    if (logMessage) {
      this.appendLog("AutoFocus active.", "ok");
    }
    void this.pollNotifications();
    this.intervalHandle = setInterval(() => {
      void this.pollNotifications();
    }, POLL_INTERVAL_MS);
  }

  private stop(message: string | null): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.running = false;
    if (message) {
      this.appendLog(message, "dim");
    }
  }

  private appendLog(message: string, tag: string): void {
    this.logSeq += 1;
    this.logs.push({
      id: this.logSeq,
      timestamp: timestamp(),
      message,
      tag,
    });
    if (this.logs.length > MAX_LOGS) {
      this.logs.splice(0, this.logs.length - MAX_LOGS);
    }
  }

  private incrementStat(key: keyof AutofocusStats, increment: number): void {
    const next = Number.parseInt(this.stats[key], 10) + increment;
    this.stats[key] = String(Number.isFinite(next) ? next : increment);
  }

  private async pollNotifications(): Promise<void> {
    if (!this.running || this.pollInFlight) {
      return;
    }

    this.pollInFlight = true;
    try {
      const snapshot = await fetchToastNotifications();
      this.available = true;
      this.accessStatus = snapshot.access;

      if (snapshot.access !== "Allowed") {
        const nextMessage = snapshot.access === "Denied"
          ? "Acces notifications refuse. Active-les dans Parametres -> Systeme -> Notifications."
          : snapshot.access === "Unknown"
            ? "Acces notifications en attente."
            : `Acces notifications indisponible: ${snapshot.access}.`;
        if (nextMessage !== this.lastAccessWarning) {
          this.lastAccessWarning = nextMessage;
          this.appendLog(nextMessage, snapshot.access === "Denied" ? "error" : "warn");
        }
        return;
      }

      this.lastAccessWarning = "";
      this.lastErrorMessage = "";

      if (this.persistedConfig.debugEnabled && snapshot.notifications.length > 0) {
        this.appendLog(
          `[debug] snapshot count=${snapshot.notifications.length} ids=${snapshot.notifications.map((item) => item.id).join(",")}`,
          "debug",
        );
      }

      const freshNotifications = snapshot.notifications.filter((item) => !this.seenNotificationIds.has(item.id));
      if (this.persistedConfig.debugEnabled && snapshot.notifications.length > 0) {
        this.appendLog(
          `[debug] fresh count=${freshNotifications.length} ids=${freshNotifications.map((item) => item.id).join(",")}`,
          "debug",
        );
      }
      if (!freshNotifications.length) {
        return;
      }

      this.incrementStat("notifications", freshNotifications.length);
      for (const notification of freshNotifications) {
        this.seenNotificationIds.add(notification.id);
        await this.handleNotification(notification.title, notification.body);
      }
      if (this.seenNotificationIds.size > MAX_SEEN_IDS) {
        this.seenNotificationIds.clear();
      }
    } catch (error) {
      this.available = false;
      this.accessStatus = "Unavailable";
      const message = error instanceof Error ? error.message : "Erreur AutoFocus inconnue.";
      if (message !== this.lastErrorMessage) {
        this.lastErrorMessage = message;
        this.appendLog(`Erreur AutoFocus : ${message}`, "error");
      }
      this.stop(null);
    } finally {
      this.pollInFlight = false;
    }
  }

  private async handleNotification(title: string, body: string): Promise<void> {
    if (this.persistedConfig.debugEnabled) {
      this.appendLog(`[debug] titre=${JSON.stringify(title)} corps=${JSON.stringify(body)}`, "debug");
    }

    const notifType = detectNotificationType(body);
    if (!notifType) {
      return;
    }

    const charactersConfig = getCharactersConfig();

    if (notifType === "mp" && charactersConfig.copyMpSender) {
      const sender = extractMpSender(body);
      if (sender) {
        const whisper = `/w ${sender} `;
        if (await copyTextToClipboard(whisper)) {
          this.appendLog(`Presse-papiers -> ${whisper}`, "ok");
        } else {
          this.appendLog("Echec copie presse-papiers MP.", "warn");
        }
      }
    }

    let pseudo = extractPseudoFromTitle(title);
    const unityFallback = pseudo === null && isUnityNotificationTitle(title);
    if (unityFallback && (await countGameWindows("unity")) > 1) {
      this.appendLog("[unity] ignore focus (plusieurs fenetres Unity ouvertes)", "dim");
      return;
    }
    if (pseudo === null && !unityFallback) {
      return;
    }

    const filters = {
      enableRetro: charactersConfig.enableRetro,
      enableUnity: charactersConfig.enableUnity,
    };

    if (pseudo === null) {
      const unityWindows = (await listGameWindows(filters)).filter((window) => window.gameType === "unity");
      if (unityWindows.length === 1) {
        pseudo = unityWindows[0].pseudo;
      }
    }

    const targetLabel = pseudo ?? "Unity";

    if (!this.persistedConfig.enabledTypes[notifType]) {
      this.appendLog(`[${notifType}] ignore (desactive) -> ${targetLabel}`, "dim");
      return;
    }

    if (pseudo) {
      const rule = ensureCharacterRule(charactersConfig, pseudo);
      if (!(rule.rotation !== false && rule[notifType] !== false)) {
        this.appendLog(`[${notifType}] ignore pour ${pseudo} (regle personnage)`, "dim");
        return;
      }
    }

    this.incrementStat("matches", 1);
    this.stats.last = targetLabel;
    this.appendLog(`[${notifType.toUpperCase()}] ${targetLabel} -> ${body}`, `type_${notifType}`);

    const result = pseudo
      ? await focusPseudo(pseudo, filters)
      : await focusGameType("unity", filters);

    if (result.ok) {
      this.incrementStat("focus", 1);
      this.appendLog(`Focus -> ${result.message}`, "ok");
    } else {
      this.appendLog(result.message, "error");
    }
  }
}

export const autofocusService = new AutoFocusService();

