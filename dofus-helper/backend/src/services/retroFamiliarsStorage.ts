import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { retroFamiliarsCatalog, type RetroFamiliarCatalogState, type RetroFamiliarItem } from "./retroFamiliarsCatalog.js";
import { resolveDataFile } from "./runtimePaths.js";

interface StoredRetroFamiliarEntry {
  id: string;
  familiarKey: string;
  addedAt: string;
  lastFedAt: string | null;
  serverName: string | null;
  characterName: string | null;
}

export interface RetroFamiliarTimingState {
  canFeed: boolean;
  overdue: boolean;
  neverFed: boolean;
  nextFeedAt: string | null;
  lateFeedAt: string | null;
  hoursUntilNextMeal: number | null;
  hoursSinceLastMeal: number | null;
}

export interface RetroFamiliarEntry {
  id: string;
  addedAt: string;
  lastFedAt: string | null;
  serverName: string | null;
  characterName: string | null;
  familiar: RetroFamiliarItem;
  status: RetroFamiliarTimingState;
}

export interface RetroFamiliarsPayload {
  ok: boolean;
  entries: RetroFamiliarEntry[];
  encyclopedia: RetroFamiliarItem[];
  dueCount: number;
  knownServers: string[];
  message?: string;
  catalogState: RetroFamiliarCatalogState;
}

const DEFAULT_RETRO_SERVERS = [
  "Boune",
  "Alisteria",
  "Fallanster",
];

function makeId(): string {
  return `familiar-${randomUUID().replaceAll("-", "").slice(0, 8)}`;
}

function parseDate(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeEntry(value: unknown): StoredRetroFamiliarEntry | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const familiarKey = String(candidate.familiarKey ?? candidate.familiar_key ?? "").trim();
  if (!familiarKey) {
    return null;
  }
  return {
    id: String(candidate.id ?? makeId()).trim() || makeId(),
    familiarKey,
    addedAt: parseDate(candidate.addedAt ?? candidate.added_at) ?? new Date().toISOString(),
    lastFedAt: parseDate(candidate.lastFedAt ?? candidate.last_fed_at),
    serverName: String(candidate.serverName ?? candidate.server_name ?? "").trim() || null,
    characterName: String(candidate.characterName ?? candidate.character_name ?? "").trim() || null,
  };
}

function resolveStorageFilePath(): string {
  return resolveDataFile("retro-familiars.json");
}

function readStoredEntries(): StoredRetroFamiliarEntry[] {
  const filePath = resolveStorageFilePath();
  if (!existsSync(filePath)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeEntry).filter((entry): entry is StoredRetroFamiliarEntry => entry !== null);
  } catch {
    return [];
  }
}

function writeStoredEntries(entries: StoredRetroFamiliarEntry[]): StoredRetroFamiliarEntry[] {
  const filePath = resolveStorageFilePath();
  mkdirSync(dirname(filePath), { recursive: true });
  const normalized = entries.map(normalizeEntry).filter((entry): entry is StoredRetroFamiliarEntry => entry !== null);
  writeFileSync(filePath, JSON.stringify(normalized, null, 2), "utf8");
  return normalized.map((entry) => ({ ...entry }));
}

function intervalValueToMilliseconds(value: number, unit: string): number {
  if (unit === "d") {
    return value * 24 * 60 * 60 * 1000;
  }
  if (unit === "m") {
    return value * 60 * 1000;
  }
  return value * 60 * 60 * 1000;
}

function buildTimingState(lastFedAt: string | null, familiar: RetroFamiliarItem): RetroFamiliarTimingState {
  if (!lastFedAt || !familiar.mealInterval) {
    return {
      canFeed: false,
      overdue: false,
      neverFed: true,
      nextFeedAt: null,
      lateFeedAt: null,
      hoursUntilNextMeal: null,
      hoursSinceLastMeal: null,
    };
  }

  const lastFedDate = new Date(lastFedAt);
  const lastFedTime = lastFedDate.getTime();
  if (Number.isNaN(lastFedTime)) {
    return {
      canFeed: false,
      overdue: false,
      neverFed: true,
      nextFeedAt: null,
      lateFeedAt: null,
      hoursUntilNextMeal: null,
      hoursSinceLastMeal: null,
    };
  }

  const now = Date.now();
  const nextFeedTime = lastFedTime + intervalValueToMilliseconds(familiar.mealInterval.start, familiar.mealInterval.unit);
  const lateFeedTime = lastFedTime + intervalValueToMilliseconds(familiar.mealInterval.end, familiar.mealInterval.unit);
  const timeUntilNextMeal = nextFeedTime - now;
  const canFeed = timeUntilNextMeal <= 0;

  return {
    canFeed,
    overdue: now > lateFeedTime,
    neverFed: false,
    nextFeedAt: new Date(nextFeedTime).toISOString(),
    lateFeedAt: new Date(lateFeedTime).toISOString(),
    hoursUntilNextMeal: canFeed ? 0 : Math.ceil(timeUntilNextMeal / (60 * 60 * 1000)),
    hoursSinceLastMeal: Math.max(0, Math.floor((now - lastFedTime) / (60 * 60 * 1000))),
  };
}

function cloneEntry(entry: RetroFamiliarEntry): RetroFamiliarEntry {
  return {
    ...entry,
    familiar: {
      ...entry.familiar,
      mealInterval: entry.familiar.mealInterval ? { ...entry.familiar.mealInterval } : null,
      foods: [...entry.familiar.foods],
      effects: entry.familiar.effects.map((effect) => ({
        ...effect,
        foods: effect.foods.map((food) => ({ ...food })),
      })),
    },
    status: { ...entry.status },
  };
}

function knownServers(entries: StoredRetroFamiliarEntry[]): string[] {
  return [...new Set([
    ...DEFAULT_RETRO_SERVERS,
    ...entries.map((entry) => entry.serverName).filter((value): value is string => Boolean(value)),
  ])].sort((left, right) => left.localeCompare(right, "fr", { sensitivity: "base" }));
}

function compareEntries(left: RetroFamiliarEntry, right: RetroFamiliarEntry): number {
  const weight = (entry: RetroFamiliarEntry): number => {
    if (entry.status.overdue) {
      return 0;
    }
    if (entry.status.canFeed) {
      return 1;
    }
    if (entry.status.neverFed) {
      return 2;
    }
    return 3;
  };
  const byWeight = weight(left) - weight(right);
  if (byWeight !== 0) {
    return byWeight;
  }
  if (left.status.nextFeedAt && right.status.nextFeedAt) {
    const byNextFeed = new Date(left.status.nextFeedAt).getTime() - new Date(right.status.nextFeedAt).getTime();
    if (byNextFeed !== 0) {
      return byNextFeed;
    }
  }
  return left.familiar.name.localeCompare(right.familiar.name, "fr", { sensitivity: "base" });
}

function enrichEntries(entries: StoredRetroFamiliarEntry[]): RetroFamiliarEntry[] {
  return entries
    .map((entry) => {
      const familiar = retroFamiliarsCatalog.getItem(entry.familiarKey);
      if (!familiar) {
        return null;
      }
      return {
        id: entry.id,
        addedAt: entry.addedAt,
        lastFedAt: entry.lastFedAt,
        serverName: entry.serverName,
        characterName: entry.characterName,
        familiar,
        status: buildTimingState(entry.lastFedAt, familiar),
      };
    })
    .filter((entry): entry is RetroFamiliarEntry => entry !== null)
    .sort(compareEntries);
}

function createPayload(ok: boolean, entries: StoredRetroFamiliarEntry[], message = "", persist = ok): RetroFamiliarsPayload {
  const catalogState = retroFamiliarsCatalog.state();
  const storedEntries = persist ? writeStoredEntries(entries) : entries.map((entry) => ({ ...entry }));
  const enrichedEntries = enrichEntries(storedEntries);
  return {
    ok,
    entries: enrichedEntries.map(cloneEntry),
    encyclopedia: retroFamiliarsCatalog.list(),
    dueCount: enrichedEntries.filter((entry) => entry.status.canFeed).length,
    knownServers: knownServers(storedEntries),
    message: message || undefined,
    catalogState,
  };
}

export const retroFamiliarsStorage = {
  list(): RetroFamiliarsPayload {
    return createPayload(true, readStoredEntries(), "", false);
  },

  summary(): { ok: boolean; dueCount: number; catalogState: RetroFamiliarCatalogState; message?: string } {
    const payload = createPayload(true, readStoredEntries(), "", false);
    return {
      ok: true,
      dueCount: payload.dueCount,
      catalogState: payload.catalogState,
      message: payload.catalogState.message,
    };
  },

  add(familiarKey: string, serverName?: string | null, characterName?: string | null): RetroFamiliarsPayload {
    const entries = readStoredEntries();
    const familiar = retroFamiliarsCatalog.getFeedableItem(familiarKey);
    if (!familiar) {
      return createPayload(false, entries, "Familier introuvable ou non nourrissable.");
    }
    entries.unshift({
      id: makeId(),
      familiarKey: familiar.key,
      addedAt: new Date().toISOString(),
      lastFedAt: null,
      serverName: String(serverName ?? "").trim() || null,
      characterName: String(characterName ?? "").trim() || null,
    });
    return createPayload(true, entries, "Familier ajoute.");
  },

  update(entryId: string, patch: { serverName?: string | null; characterName?: string | null }): RetroFamiliarsPayload {
    const entries = readStoredEntries();
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) {
      return createPayload(false, entries, "Familier introuvable.");
    }
    if (typeof patch.serverName !== "undefined") {
      entry.serverName = String(patch.serverName ?? "").trim() || null;
    }
    if (typeof patch.characterName !== "undefined") {
      entry.characterName = String(patch.characterName ?? "").trim() || null;
    }
    return createPayload(true, entries, "Informations du familier mises a jour.");
  },

  feed(entryId: string, fedAt: string | null): RetroFamiliarsPayload {
    const entries = readStoredEntries();
    const entry = entries.find((item) => item.id === entryId);
    if (!entry) {
      return createPayload(false, entries, "Familier introuvable.");
    }
    entry.lastFedAt = parseDate(fedAt) ?? new Date().toISOString();
    return createPayload(true, entries, "Repas enregistre.");
  },

  delete(entryId: string): RetroFamiliarsPayload {
    const entries = readStoredEntries();
    const nextEntries = entries.filter((entry) => entry.id !== entryId);
    if (nextEntries.length === entries.length) {
      return createPayload(false, entries, "Familier introuvable.");
    }
    return createPayload(true, nextEntries, "Familier supprime.");
  },
};
