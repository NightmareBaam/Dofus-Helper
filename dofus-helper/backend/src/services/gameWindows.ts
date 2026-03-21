import { focusWindow, listVisibleWindows } from "./windowsBridge.js";

export type GameType = "retro" | "unity";

export interface ParsedGameWindow {
  hwnd: number;
  title: string;
  pseudo: string;
  gameType: GameType;
  classe: string | null;
  version: string | null;
}

const RETRO_TITLE_PATTERN = /^(?<pseudo>.+?)\s*-\s*Dofus\s+Retro\s+v(?<version>\d+(?:\.\d+)+)\s*$/i;
const UNITY_VERSION_PATTERN = /^\d+(?:\.\d+)+$/;
const UNITY_NOTIFICATION_TITLE_PATTERN = /^dofus\s+3(?:\.\d+)*$/i;

export function parseWindowTitle(hwnd: number, title: string): ParsedGameWindow | null {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    return null;
  }

  const retroMatch = normalizedTitle.match(RETRO_TITLE_PATTERN);
  if (retroMatch?.groups?.pseudo && retroMatch.groups.version) {
    return {
      hwnd,
      title: normalizedTitle,
      pseudo: retroMatch.groups.pseudo.trim(),
      gameType: "retro",
      classe: null,
      version: retroMatch.groups.version,
    };
  }

  const parts = normalizedTitle.split(" - ").map((part) => part.trim());
  if (parts.length >= 4 && parts.at(-1)?.toLowerCase() === "release") {
    const pseudo = parts.slice(0, -3).join(" - ").trim();
    const classe = parts.at(-3) ?? "";
    const version = parts.at(-2) ?? "";
    if (pseudo && classe && UNITY_VERSION_PATTERN.test(version)) {
      return {
        hwnd,
        title: normalizedTitle,
        pseudo,
        gameType: "unity",
        classe,
        version,
      };
    }
  }

  return null;
}

export function extractPseudoFromTitle(title: string): string | null {
  return parseWindowTitle(0, title)?.pseudo ?? null;
}

export function isUnityNotificationTitle(title: string): boolean {
  return UNITY_NOTIFICATION_TITLE_PATTERN.test(title.trim());
}

export async function listGameWindows(options?: { enableRetro?: boolean; enableUnity?: boolean }): Promise<ParsedGameWindow[]> {
  const enableRetro = options?.enableRetro !== false;
  const enableUnity = options?.enableUnity !== false;
  const rawWindows = await listVisibleWindows();
  return rawWindows
    .map((window) => parseWindowTitle(window.hwnd, window.title))
    .filter((window): window is ParsedGameWindow => window !== null)
    .filter((window) => (window.gameType === "retro" ? enableRetro : enableUnity));
}

export async function countGameWindows(gameType: GameType, options?: { enableRetro?: boolean; enableUnity?: boolean }): Promise<number> {
  const windows = await listGameWindows(options);
  return windows.filter((window) => window.gameType === gameType).length;
}

export async function focusPseudo(
  pseudo: string,
  options?: { enableRetro?: boolean; enableUnity?: boolean },
): Promise<{ ok: boolean; message: string }> {
  const windows = await listGameWindows(options);
  const normalizedPseudo = pseudo.trim().toLowerCase();
  const target = windows.find((window) => window.pseudo.trim().toLowerCase() === normalizedPseudo);
  if (!target) {
    return { ok: false, message: `Aucune fenetre compatible trouvee pour ${pseudo}` };
  }
  return focusWindow(target.hwnd);
}

export async function focusGameType(
  gameType: GameType,
  options?: { enableRetro?: boolean; enableUnity?: boolean },
): Promise<{ ok: boolean; message: string }> {
  const windows = await listGameWindows(options);
  const target = windows.find((window) => window.gameType === gameType);
  if (!target) {
    return { ok: false, message: `Aucune fenetre ${gameType} compatible trouvee.` };
  }
  return focusWindow(target.hwnd);
}
