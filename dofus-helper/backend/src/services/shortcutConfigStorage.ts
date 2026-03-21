import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { resolveDataFile } from "./runtimePaths.js";

export interface ShortcutValues {
  next: string | null;
  prev: string | null;
  last: string | null;
  refresh: string | null;
}

export interface ShortcutStatus {
  text: string;
  tone: "muted" | "danger";
}

export interface ShortcutsConfig {
  values: ShortcutValues;
  debugEnabled: boolean;
}

const DEFAULT_VALUES: ShortcutValues = {
  next: "ctrl+right",
  prev: "ctrl+left",
  last: "ctrl+down",
  refresh: null,
};

function resolveStorageFilePath(): string {
  return resolveDataFile("shortcuts.json");
}

function normalizeOptionalShortcut(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  return raw || null;
}

function normalizeConfig(value: unknown): ShortcutsConfig {
  if (typeof value !== "object" || value === null) {
    return { values: { ...DEFAULT_VALUES }, debugEnabled: false };
  }
  const candidate = value as Record<string, unknown>;
  const values = typeof candidate.values === "object" && candidate.values !== null
    ? candidate.values as Record<string, unknown>
    : {};
  return {
    values: {
      next: normalizeOptionalShortcut(values.next ?? DEFAULT_VALUES.next),
      prev: normalizeOptionalShortcut(values.prev ?? DEFAULT_VALUES.prev),
      last: normalizeOptionalShortcut(values.last ?? DEFAULT_VALUES.last),
      refresh: normalizeOptionalShortcut(values.refresh ?? DEFAULT_VALUES.refresh),
    },
    debugEnabled: candidate.debugEnabled === true,
  };
}

export function readShortcutsConfig(): ShortcutsConfig {
  const filePath = resolveStorageFilePath();
  if (!existsSync(filePath)) {
    return normalizeConfig(null);
  }
  try {
    return normalizeConfig(JSON.parse(readFileSync(filePath, "utf8")));
  } catch {
    return normalizeConfig(null);
  }
}

export function writeShortcutsConfig(config: ShortcutsConfig): ShortcutsConfig {
  const filePath = resolveStorageFilePath();
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(config, null, 2), "utf8");
  return normalizeConfig(config);
}
