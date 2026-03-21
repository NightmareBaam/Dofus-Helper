import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { type ParsedGameWindow, listGameWindows } from "./gameWindows.js";
import { resolveDataFile } from "./runtimePaths.js";
import { focusWindow } from "./windowsBridge.js";

export type CharacterNotifType = "combat" | "echange" | "groupe" | "mp";

export interface CharacterRule {
  combat: boolean;
  echange: boolean;
  groupe: boolean;
  mp: boolean;
  rotation: boolean;
}

export interface CharacterWindow {
  index: number;
  hwnd: number;
  title: string;
  pseudo: string;
  gameType: "retro" | "unity";
  classe: string | null;
  version: string | null;
  rule: CharacterRule;
  rotationEnabled: boolean;
  shortcut: string | null;
}

export interface CharactersConfig {
  enableRetro: boolean;
  enableUnity: boolean;
  copyMpSender: boolean;
  order: number[];
  rules: Record<string, CharacterRule>;
  shortcuts: Record<string, string | null>;
}

export interface CharactersPayload {
  ok: boolean;
  windows: CharacterWindow[];
  config: CharactersConfig;
  availableTypes: CharacterNotifType[];
  message?: string;
}

const AVAILABLE_TYPES: CharacterNotifType[] = ["combat", "echange", "groupe", "mp"];

function defaultRule(): CharacterRule {
  return { combat: true, echange: true, groupe: true, mp: true, rotation: true };
}

function normalizeOptionalShortcut(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  return raw || null;
}

function resolveStorageFilePath(): string {
  return resolveDataFile("characters.json");
}

function normalizeRule(value: unknown): CharacterRule {
  if (typeof value !== "object" || value === null) {
    return defaultRule();
  }
  const candidate = value as Record<string, unknown>;
  return {
    combat: candidate.combat !== false,
    echange: candidate.echange !== false,
    groupe: candidate.groupe !== false,
    mp: candidate.mp !== false,
    rotation: candidate.rotation !== false,
  };
}

function normalizeConfig(value: unknown): CharactersConfig {
  if (typeof value !== "object" || value === null) {
    return { enableRetro: true, enableUnity: true, copyMpSender: true, order: [], rules: {}, shortcuts: {} };
  }
  const candidate = value as Record<string, unknown>;
  const rules: Record<string, CharacterRule> = {};
  const shortcuts: Record<string, string | null> = {};
  if (typeof candidate.rules === "object" && candidate.rules !== null) {
    for (const [pseudo, rule] of Object.entries(candidate.rules as Record<string, unknown>)) {
      rules[pseudo] = normalizeRule(rule);
    }
  }
  if (typeof candidate.shortcuts === "object" && candidate.shortcuts !== null) {
    for (const [pseudo, shortcut] of Object.entries(candidate.shortcuts as Record<string, unknown>)) {
      shortcuts[pseudo] = normalizeOptionalShortcut(shortcut);
    }
  }
  return {
    enableRetro: candidate.enableRetro !== false,
    enableUnity: candidate.enableUnity !== false,
    copyMpSender: candidate.copyMpSender !== false,
    order: Array.isArray(candidate.order) ? candidate.order.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0) : [],
    rules,
    shortcuts,
  };
}

export function getCharactersConfig(): CharactersConfig {
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

function writeConfig(config: CharactersConfig): CharactersConfig {
  const filePath = resolveStorageFilePath();
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(config, null, 2), "utf8");
  return normalizeConfig(config);
}

export function ensureCharacterRule(config: CharactersConfig, pseudo: string): CharacterRule {
  if (!config.rules[pseudo]) {
    config.rules[pseudo] = defaultRule();
  }
  return config.rules[pseudo];
}

function buildPayload(config: CharactersConfig, windows: CharacterWindow[], ok = true, message?: string): CharactersPayload {
  return {
    ok,
    windows,
    config,
    availableTypes: [...AVAILABLE_TYPES],
    message,
  };
}

function toCharacterWindow(window: ParsedGameWindow, index: number, config: CharactersConfig): CharacterWindow {
  const rule = ensureCharacterRule(config, window.pseudo);
  return {
    index: index + 1,
    ...window,
    rule,
    rotationEnabled: rule.rotation !== false,
    shortcut: normalizeOptionalShortcut(config.shortcuts[window.pseudo]),
  };
}

export async function listOrderedCharacterWindows(config = getCharactersConfig()): Promise<CharacterWindow[]> {
  const parsed = await listGameWindows({ enableRetro: config.enableRetro, enableUnity: config.enableUnity });
  const byHwnd = new Map(parsed.map((window) => [window.hwnd, window]));
  const ordered: ParsedGameWindow[] = [];

  for (const hwnd of config.order) {
    const window = byHwnd.get(hwnd);
    if (window) {
      ordered.push(window);
      byHwnd.delete(hwnd);
    }
  }

  ordered.push(...byHwnd.values());
  return ordered.map((window, index) => toCharacterWindow(window, index, config));
}

export async function listManagedCharacterWindows(): Promise<CharacterWindow[]> {
  const config = getCharactersConfig();
  const windows = await listOrderedCharacterWindows(config);
  return windows.filter((window) => window.rotationEnabled);
}

export const charactersStorage = {
  async list(): Promise<CharactersPayload> {
    const config = getCharactersConfig();
    const windows = await listOrderedCharacterWindows(config);
    writeConfig(config);
    return buildPayload(config, windows);
  },

  async refresh(): Promise<CharactersPayload> {
    const config = getCharactersConfig();
    const windows = await listOrderedCharacterWindows(config);
    writeConfig(config);
    return buildPayload(config, windows);
  },

  async setFilter(gameType: string, enabled: boolean): Promise<CharactersPayload> {
    const config = getCharactersConfig();
    if (gameType === "retro") {
      config.enableRetro = enabled;
    } else if (gameType === "unity") {
      config.enableUnity = enabled;
    }
    writeConfig(config);
    const windows = await listOrderedCharacterWindows(config);
    return buildPayload(config, windows);
  },

  async setCopyMpSender(enabled: boolean): Promise<CharactersPayload> {
    const config = getCharactersConfig();
    config.copyMpSender = enabled;
    writeConfig(config);
    const windows = await listOrderedCharacterWindows(config);
    return buildPayload(config, windows);
  },

  async saveOrder(hwnds: number[]): Promise<CharactersPayload> {
    const config = getCharactersConfig();
    const windows = await listOrderedCharacterWindows(config);
    const known = new Set(windows.map((window) => window.hwnd));
    config.order = hwnds.filter((hwnd) => known.has(hwnd));
    writeConfig(config);
    const reordered = await listOrderedCharacterWindows(config);
    return buildPayload(config, reordered);
  },

  async setRule(pseudo: string, notifType: string, enabled: boolean): Promise<{ ok: boolean; rule: CharacterRule; config: CharactersConfig; message?: string }> {
    const config = getCharactersConfig();
    const normalizedType = String(notifType).trim() as CharacterNotifType;
    if (!AVAILABLE_TYPES.includes(normalizedType)) {
      return { ok: false, rule: defaultRule(), config, message: "Type de notification invalide." };
    }
    const rule = ensureCharacterRule(config, pseudo);
    rule[normalizedType] = enabled;
    writeConfig(config);
    return { ok: true, rule, config };
  },

  async setAllRules(notifType: string, enabled: boolean): Promise<CharactersPayload> {
    const config = getCharactersConfig();
    const normalizedType = String(notifType).trim() as CharacterNotifType;
    if (!AVAILABLE_TYPES.includes(normalizedType)) {
      const windows = await listOrderedCharacterWindows(config);
      return buildPayload(config, windows, false, "Type de notification invalide.");
    }

    const windows = await listOrderedCharacterWindows(config);
    const pseudos = new Set<string>([
      ...Object.keys(config.rules),
      ...windows.map((window) => window.pseudo),
    ]);

    for (const pseudo of pseudos) {
      const rule = ensureCharacterRule(config, pseudo);
      rule[normalizedType] = enabled;
    }

    writeConfig(config);
    return buildPayload(config, await listOrderedCharacterWindows(config));
  },

  async setRotation(pseudo: string, enabled: boolean): Promise<{ ok: boolean; rule: CharacterRule; config: CharactersConfig }> {
    const config = getCharactersConfig();
    const rule = ensureCharacterRule(config, pseudo);
    rule.rotation = enabled;
    writeConfig(config);
    return { ok: true, rule, config };
  },

  async setShortcut(pseudo: string, value: string | null): Promise<CharactersPayload> {
    const config = getCharactersConfig();
    const nextValue = normalizeOptionalShortcut(value);
    if (nextValue) {
      config.shortcuts[pseudo] = nextValue;
    } else {
      delete config.shortcuts[pseudo];
    }
    writeConfig(config);
    const windows = await listOrderedCharacterWindows(config);
    return buildPayload(config, windows);
  },

  async focusWindow(hwnd: number): Promise<{ ok: boolean; message: string }> {
    return focusWindow(hwnd);
  },
};
