import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { charactersStorage, getCharactersConfig, listManagedCharacterWindows, listOrderedCharacterWindows } from "./charactersStorage.js";
import { focusTrackerService } from "./focusTrackerService.js";
import { readShortcutsConfig, writeShortcutsConfig, type ShortcutStatus, type ShortcutValues } from "./shortcutConfigStorage.js";
import { runtimeStateService } from "./runtimeStateService.js";
import { focusWindowByTitle } from "./windowsBridge.js";

export type ShortcutAction = keyof ShortcutValues;

export interface ShortcutDebugEvent {
  id: number;
  timestamp: string;
  shortcut: string;
  recognized: boolean;
}

export interface ShortcutsState {
  values: ShortcutValues;
  status: ShortcutStatus;
  debugEnabled: boolean;
  keyboardAvailable: boolean;
  mouseAvailable: boolean;
}

interface ShortcutBinding {
  shortcut: string;
  label: string;
  kind: "action" | "character";
  action?: ShortcutAction;
  pseudo?: string;
}

type ShortcutTarget =
  | { kind: "none" }
  | { kind: "action"; action: ShortcutAction }
  | { kind: "character"; pseudo: string }
  | { kind: "character-group"; pseudos: string[] }
  | { kind: "ambiguous"; message: string };

const SHORTCUT_MODIFIERS = ["ctrl", "shift", "alt"] as const;
const SHORTCUT_MOUSE_BUTTONS = new Set(["mouse:left", "mouse:middle", "mouse:right", "mouse:x1", "mouse:x2"]);
const SUPPORTED_TERMINAL_KEYS = new Set<string>([
  "left", "right", "up", "down", "esc", "space", "enter", "tab", "delete", "backspace", "home", "end", "pageup", "pagedown", "insert",
  "numpad0", "numpad1", "numpad2", "numpad3", "numpad4", "numpad5", "numpad6", "numpad7", "numpad8", "numpad9",
  "numpaddecimal", "numpaddivide", "numpadmultiply", "numpadsubtract", "numpadadd",
  "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12",
  "²", "&", "é", "\"", "'", "(", "-", "è", "_", "ç", "à", ")", "=",
  ..."abcdefghijklmnopqrstuvwxyz0123456789".split(""),
]);
const POLLER_WATCHES: Array<{ id: string; vks: number[]; key?: string }> = [
  { id: "left", vks: [0x25], key: "left" },
  { id: "right", vks: [0x27], key: "right" },
  { id: "up", vks: [0x26], key: "up" },
  { id: "down", vks: [0x28], key: "down" },
  { id: "esc", vks: [0x1B], key: "esc" },
  { id: "space", vks: [0x20], key: "space" },
  { id: "enter", vks: [0x0D], key: "enter" },
  { id: "tab", vks: [0x09], key: "tab" },
  { id: "delete", vks: [0x2E], key: "delete" },
  { id: "backspace", vks: [0x08], key: "backspace" },
  { id: "home", vks: [0x24], key: "home" },
  { id: "end", vks: [0x23], key: "end" },
  { id: "pageup", vks: [0x21], key: "pageup" },
  { id: "pagedown", vks: [0x22], key: "pagedown" },
  { id: "insert", vks: [0x2D], key: "insert" },
  { id: "f1", vks: [0x70], key: "f1" },
  { id: "f2", vks: [0x71], key: "f2" },
  { id: "f3", vks: [0x72], key: "f3" },
  { id: "f4", vks: [0x73], key: "f4" },
  { id: "f5", vks: [0x74], key: "f5" },
  { id: "f6", vks: [0x75], key: "f6" },
  { id: "f7", vks: [0x76], key: "f7" },
  { id: "f8", vks: [0x77], key: "f8" },
  { id: "f9", vks: [0x78], key: "f9" },
  { id: "f10", vks: [0x79], key: "f10" },
  { id: "f11", vks: [0x7A], key: "f11" },
  { id: "f12", vks: [0x7B], key: "f12" },
  { id: "vk_c0", vks: [0xC0] },
  { id: "vk_df", vks: [0xDF] },
  { id: "a", vks: [0x41] },
  { id: "b", vks: [0x42] },
  { id: "c", vks: [0x43] },
  { id: "d", vks: [0x44] },
  { id: "e", vks: [0x45] },
  { id: "f", vks: [0x46] },
  { id: "g", vks: [0x47] },
  { id: "h", vks: [0x48] },
  { id: "i", vks: [0x49] },
  { id: "j", vks: [0x4A] },
  { id: "k", vks: [0x4B] },
  { id: "l", vks: [0x4C] },
  { id: "m", vks: [0x4D] },
  { id: "n", vks: [0x4E] },
  { id: "o", vks: [0x4F] },
  { id: "p", vks: [0x50] },
  { id: "q", vks: [0x51] },
  { id: "r", vks: [0x52] },
  { id: "s", vks: [0x53] },
  { id: "t", vks: [0x54] },
  { id: "u", vks: [0x55] },
  { id: "v", vks: [0x56] },
  { id: "w", vks: [0x57] },
  { id: "x", vks: [0x58] },
  { id: "y", vks: [0x59] },
  { id: "z", vks: [0x5A] },
  { id: "digit0", vks: [0x30] },
  { id: "digit1", vks: [0x31] },
  { id: "digit2", vks: [0x32] },
  { id: "digit3", vks: [0x33] },
  { id: "digit4", vks: [0x34] },
  { id: "digit5", vks: [0x35] },
  { id: "digit6", vks: [0x36] },
  { id: "digit7", vks: [0x37] },
  { id: "digit8", vks: [0x38] },
  { id: "digit9", vks: [0x39] },
  { id: "oem_minus", vks: [0xBD] },
  { id: "oem_plus", vks: [0xBB] },
  { id: "oem4", vks: [0xDB], key: "^" },
  { id: "oem6", vks: [0xDD], key: "$" },
  { id: "oem5", vks: [0xDC], key: "*" },
  { id: "oem7", vks: [0xDE] },
  { id: "oem102", vks: [0xE2] },
  { id: "oemcomma", vks: [0xBC] },
  { id: "oemperiod", vks: [0xBE] },
  { id: "oem2", vks: [0xBF] },
  { id: "oem1", vks: [0xBA] },
  { id: "numpad0", vks: [0x60], key: "numpad0" },
  { id: "numpad1", vks: [0x61], key: "numpad1" },
  { id: "numpad2", vks: [0x62], key: "numpad2" },
  { id: "numpad3", vks: [0x63], key: "numpad3" },
  { id: "numpad4", vks: [0x64], key: "numpad4" },
  { id: "numpad5", vks: [0x65], key: "numpad5" },
  { id: "numpad6", vks: [0x66], key: "numpad6" },
  { id: "numpad7", vks: [0x67], key: "numpad7" },
  { id: "numpad8", vks: [0x68], key: "numpad8" },
  { id: "numpad9", vks: [0x69], key: "numpad9" },
  { id: "numpaddecimal", vks: [0x6E], key: "numpaddecimal" },
  { id: "numpaddivide", vks: [0x6F], key: "numpaddivide" },
  { id: "numpadmultiply", vks: [0x6A], key: "numpadmultiply" },
  { id: "numpadsubtract", vks: [0x6D], key: "numpadsubtract" },
  { id: "numpadadd", vks: [0x6B], key: "numpadadd" },
  { id: "mouse_left", vks: [0x01], key: "mouse:left" },
  { id: "mouse_right", vks: [0x02], key: "mouse:right" },
  { id: "mouse_middle", vks: [0x04], key: "mouse:middle" },
  { id: "mouse_x1", vks: [0x05], key: "mouse:x1" },
  { id: "mouse_x2", vks: [0x06], key: "mouse:x2" },
];

function timestamp(): string {
  return new Date().toLocaleTimeString("fr-FR", { hour12: false });
}

function normalizeShortcut(shortcut: string | null | undefined): string | null {
  if (shortcut === null || shortcut === undefined) {
    return null;
  }
  const raw = String(shortcut).trim().toLowerCase();
  if (["", "aucun", "none"].includes(raw)) {
    return null;
  }

  const aliases: Record<string, string> = {
    control: "ctrl",
    ctl: "ctrl",
    mouse1: "mouse:left",
    button1: "mouse:left",
    mouse_left: "mouse:left",
    mouse2: "mouse:right",
    button2: "mouse:right",
    mouse_right: "mouse:right",
    mouse3: "mouse:middle",
    button3: "mouse:middle",
    mouse_middle: "mouse:middle",
    mouse4: "mouse:x1",
    button4: "mouse:x1",
    mouse_x1: "mouse:x1",
    mouse5: "mouse:x2",
    button5: "mouse:x2",
    mouse_x2: "mouse:x2",
    xbutton1: "mouse:x1",
    xbutton2: "mouse:x2",
    arrowleft: "left",
    arrowright: "right",
    arrowup: "up",
    arrowdown: "down",
    pageup: "pageup",
    pagedown: "pagedown",
    "1": "&",
    "2": "é",
    "3": "\"",
    "4": "'",
    "5": "(",
    "6": "-",
    "7": "è",
    "8": "_",
    "9": "ç",
    "0": "à",
    "twosuperior": "²",
    "²": "²",
  };

  const parts: string[] = [];
  for (const rawPart of raw.split("+")) {
    const cleaned = aliases[rawPart.trim()] ?? rawPart.trim();
    if (!cleaned || parts.includes(cleaned)) {
      continue;
    }
    parts.push(cleaned);
  }

  const ordered: string[] = [...SHORTCUT_MODIFIERS.filter((part) => parts.includes(part))];
  ordered.push(...parts.filter((part) => !SHORTCUT_MODIFIERS.includes(part as typeof SHORTCUT_MODIFIERS[number])));
  return ordered.length ? ordered.join("+") : null;
}

function terminalPart(shortcut: string | null): string | null {
  if (!shortcut) {
    return null;
  }
  const parts = shortcut.split("+");
  return parts.length ? parts[parts.length - 1] : null;
}

function toPowerShellSingleQuoted(value: string): string {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function buildPollerScript(): string {
  const watches = POLLER_WATCHES
    .map((item) => {
      const parts = [
        `Id = ${toPowerShellSingleQuoted(item.id)}`,
        `Vks = @(${item.vks.join(", ")})`,
      ];
      if (item.key) {
        parts.push(`Key = ${toPowerShellSingleQuoted(item.key)}`);
      }
      return `@{ ${parts.join("; ")} }`;
    })
    .join(",\n  ");
  return [
    'Add-Type @"',
    'using System;',
    'using System.Text;',
    'using System.Runtime.InteropServices;',
    'public static class Win32Input {',
    '  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);',
    '  [DllImport("user32.dll")] public static extern int ToUnicodeEx(uint wVirtKey, uint wScanCode, byte[] lpKeyState, StringBuilder pwszBuff, int cchBuff, uint wFlags, IntPtr dwhkl);',
    '  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint uCode, uint uMapType);',
    '  [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint idThread);',
    '}',
    '"@',
    '$utf8NoBom = New-Object System.Text.UTF8Encoding($false)',
    '[Console]::InputEncoding = $utf8NoBom',
    '[Console]::OutputEncoding = $utf8NoBom',
    '$OutputEncoding = $utf8NoBom',
    '$watches = @(',
    `  ${watches}`,
    ')',
    '$state = @{}',
    'foreach ($item in $watches) { $state[$item.Id] = $false }',
    '$modifierKeys = @{',
    '  ctrl = @(0x11, 0xA2, 0xA3);',
    '  shift = @(0x10, 0xA0, 0xA1);',
    '  alt = @(0x12, 0xA4, 0xA5);',
    '}',
    'function Test-Key([int[]]$codes) {',
    '  foreach ($code in $codes) {',
    '    if ([Win32Input]::GetAsyncKeyState($code) -band 0x8000) { return $true }',
    '  }',
    '  return $false',
    '}',
    'function Resolve-Key([hashtable]$item) {',
    '  if ($item.ContainsKey("Key") -and $item.Key) {',
    '    return [string]$item.Key',
    '  }',
    '  $layout = [Win32Input]::GetKeyboardLayout(0)',
    '  foreach ($vk in $item.Vks) {',
    '    $keyState = New-Object byte[] 256',
    '    $scanCode = [Win32Input]::MapVirtualKey([uint32]$vk, 0)',
    '    $buffer = New-Object System.Text.StringBuilder 8',
    '    $result = [Win32Input]::ToUnicodeEx([uint32]$vk, [uint32]$scanCode, $keyState, $buffer, $buffer.Capacity, 0, $layout)',
    '    if ($result -gt 0) {',
    '      return $buffer.ToString().Substring(0, 1).ToLower()',
    '    }',
    '  }',
    '  return $null',
    '}',
    'while ($true) {',
    '  $mods = New-Object System.Collections.Generic.List[string]',
    '  if (Test-Key $modifierKeys.ctrl) { $mods.Add("ctrl") | Out-Null }',
    '  if (Test-Key $modifierKeys.shift) { $mods.Add("shift") | Out-Null }',
    '  if (Test-Key $modifierKeys.alt) { $mods.Add("alt") | Out-Null }',
    '  foreach ($item in $watches) {',
    '    $resolvedKey = Resolve-Key $item',
    '    if (-not $resolvedKey) { continue }',
    '    $pressed = Test-Key $item.Vks',
    '    $previous = [bool]$state[$item.Id]',
    '    if ($pressed -and -not $previous) {',
    '      $parts = New-Object System.Collections.Generic.List[string]',
    '      foreach ($modifier in $mods) { $parts.Add($modifier) | Out-Null }',
    '      $parts.Add([string]$resolvedKey) | Out-Null',
    '      [Console]::Out.WriteLine(($parts -join "+"))',
    '      [Console]::Out.Flush()',
    '    }',
    '    $state[$item.Id] = $pressed',
    '  }',
    '  Start-Sleep -Milliseconds 15',
    '}',
  ].join("\n");
}

class ShortcutsService {
  private config = readShortcutsConfig();
  private appliedValues: ShortcutValues = { ...this.config.values };
  private status: ShortcutStatus = { text: "", tone: "muted" };
  private keyboardAvailable = false;
  private mouseAvailable = false;
  private debugEvents: ShortcutDebugEvent[] = [];
  private debugSeq = 0;
  private poller: ChildProcessWithoutNullStreams | null = null;
  private lineBuffer = "";

  constructor() {
    this.startPoller();
    this.applyShortcuts(true);
  }

  getState(): ShortcutsState {
    return {
      values: { ...this.config.values },
      status: { ...this.status },
      debugEnabled: this.config.debugEnabled,
      keyboardAvailable: this.keyboardAvailable,
      mouseAvailable: this.mouseAvailable,
    };
  }

  poll(lastEventId: number): { shortcutEvents: ShortcutDebugEvent[]; shortcutsState: ShortcutsState } {
    return {
      shortcutEvents: this.debugEvents.filter((event) => event.id > lastEventId),
      shortcutsState: this.getState(),
    };
  }

  setShortcut(action: string, value: string | null): ShortcutsState {
    if (!["next", "prev", "last", "refresh", "helper"].includes(action)) {
      throw new Error("Action de raccourci invalide.");
    }
    this.config.values[action as ShortcutAction] = normalizeShortcut(value);
    this.config = writeShortcutsConfig(this.config);
    return this.getState();
  }

  async setCharacterShortcut(pseudo: string, value: string | null): Promise<void> {
    const normalizedPseudo = String(pseudo ?? "").trim();
    if (!normalizedPseudo) {
      throw new Error("Personnage invalide.");
    }
    const normalizedValue = normalizeShortcut(value);
    if (normalizedValue && !this.isSupportedShortcut(normalizedValue)) {
      throw new Error("Combinaison non supportee sur cette machine.");
    }
    if (normalizedValue) {
      const conflict = this.findShortcutConflict(normalizedValue, normalizedPseudo);
      if (conflict) {
        throw new Error(`[${normalizedValue}] deja utilise par ${conflict.label}.`);
      }
    }
    await charactersStorage.setShortcut(normalizedPseudo, normalizedValue);
    this.refreshStatus(true);
  }

  applyShortcuts(silent = false): ShortcutsState {
    const normalizedValues: ShortcutValues = {
      next: normalizeShortcut(this.config.values.next),
      prev: normalizeShortcut(this.config.values.prev),
      last: normalizeShortcut(this.config.values.last),
      refresh: normalizeShortcut(this.config.values.refresh),
      helper: normalizeShortcut(this.config.values.helper),
    };
    this.config.values = normalizedValues;
    this.config = writeShortcutsConfig(this.config);
    this.appliedValues = { ...normalizedValues };
    this.refreshStatus(silent);
    return this.getState();
  }

  setDebug(enabled: boolean): ShortcutsState {
    this.config.debugEnabled = enabled;
    this.config = writeShortcutsConfig(this.config);
    this.status = enabled ? { text: "Mode debug actif.", tone: "muted" } : { text: "", tone: "muted" };
    return this.getState();
  }

  private isSupportedShortcut(shortcut: string): boolean {
    const terminal = terminalPart(shortcut);
    if (!terminal) {
      return false;
    }
    return SHORTCUT_MOUSE_BUTTONS.has(terminal) || SUPPORTED_TERMINAL_KEYS.has(terminal);
  }

  private startPoller(): void {
    if (this.poller) {
      return;
    }

    const script = buildPollerScript();
    this.poller = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
      windowsHide: true,
    });
    this.keyboardAvailable = true;
    this.mouseAvailable = true;

    this.poller.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      this.lineBuffer += text;
      const lines = this.lineBuffer.split(/\r?\n/);
      this.lineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const shortcut = normalizeShortcut(line.trim());
        if (!shortcut) {
          continue;
        }
        void this.handleShortcut(shortcut);
      }
    });

    this.poller.stderr.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text) {
        this.status = { text, tone: "danger" };
      }
    });

    this.poller.on("exit", () => {
      this.keyboardAvailable = false;
      this.mouseAvailable = false;
      this.poller = null;
      this.status = { text: "Capture globale indisponible.", tone: "danger" };
    });
  }

  private async handleShortcut(shortcut: string): Promise<void> {
    const target = this.recognizedTarget(shortcut);
    const recognized = target.kind !== "none";

    if (this.config.debugEnabled) {
      this.debugSeq += 1;
      this.debugEvents.push({
        id: this.debugSeq,
        timestamp: timestamp(),
        shortcut,
        recognized,
      });
      if (this.debugEvents.length > 250) {
        this.debugEvents.splice(0, this.debugEvents.length - 250);
      }
    }

    if (target.kind === "none") {
      return;
    }

    if (target.kind === "ambiguous") {
      this.status = { text: target.message, tone: "danger" };
      return;
    }

    try {
      if (target.kind === "action") {
        if (target.action === "next") {
          const windows = await listManagedCharacterWindows();
          const result = await focusTrackerService.cycle(+1, windows);
          if (!result.ok) {
            this.status = { text: result.message, tone: "danger" };
          }
        } else if (target.action === "prev") {
          const windows = await listManagedCharacterWindows();
          const result = await focusTrackerService.cycle(-1, windows);
          if (!result.ok) {
            this.status = { text: result.message, tone: "danger" };
          }
        } else if (target.action === "last") {
          const windows = await listManagedCharacterWindows();
          const result = await focusTrackerService.focusLast(windows);
          if (!result.ok) {
            this.status = { text: result.message, tone: "danger" };
          }
        } else if (target.action === "refresh") {
          runtimeStateService.publishCharacters(await charactersStorage.refresh());
          this.status = { text: "Liste actualisee.", tone: "muted" };
        } else if (target.action === "helper") {
          const result = await focusWindowByTitle("Dofus Helper");
          if (!result.ok) {
            this.status = { text: result.message, tone: "danger" };
          }
        }
      } else if (target.kind === "character") {
        const windows = await listOrderedCharacterWindows();
        const character = windows.find((window) => window.pseudo.trim().toLowerCase() === target.pseudo.trim().toLowerCase());
        if (!character) {
          this.status = { text: `Aucune fenetre compatible trouvee pour ${target.pseudo}.`, tone: "danger" };
          return;
        }
        const result = await focusTrackerService.focusWindow(character.hwnd);
        if (!result.ok) {
          this.status = { text: result.message, tone: "danger" };
        }
      } else {
        const windows = await listOrderedCharacterWindows();
        const matchingWindows = windows.filter((window) =>
          target.pseudos.some((pseudo) => window.pseudo.trim().toLowerCase() === pseudo.trim().toLowerCase()),
        );
        if (matchingWindows.length === 0) {
          this.status = { text: `Aucune fenetre compatible trouvee pour ${target.pseudos.join(", ")}.`, tone: "danger" };
          return;
        }
        if (matchingWindows.length > 1) {
          this.status = {
            text: `[${shortcut}] correspond a plusieurs personnages ouverts : ${matchingWindows.map((window) => window.pseudo).join(", ")}.`,
            tone: "danger",
          };
          return;
        }
        const [character] = matchingWindows;
        const result = await focusTrackerService.focusWindow(character.hwnd);
        if (!result.ok) {
          this.status = { text: result.message, tone: "danger" };
        }
      }
    } catch (error) {
      this.status = { text: error instanceof Error ? error.message : "Erreur raccourci.", tone: "danger" };
    }
  }

  private refreshStatus(silent: boolean): void {
    const bindings = this.collectBindings();
    const active = bindings.map((binding) => `[${binding.shortcut}] ${binding.label}`);
    const errors = this.bindingErrors(bindings);
    if (errors.length) {
      this.status = { text: errors.join(" ; "), tone: "danger" };
      return;
    }
    if (!silent && !active.length) {
      this.status = { text: "Aucun raccourci actif.", tone: "muted" };
      return;
    }
    this.status = { text: "", tone: "muted" };
  }

  private collectBindings(): ShortcutBinding[] {
    const bindings: ShortcutBinding[] = [];
    for (const action of Object.keys(this.appliedValues) as ShortcutAction[]) {
      const shortcut = normalizeShortcut(this.appliedValues[action]);
      if (!shortcut) {
        continue;
      }
      bindings.push({
        shortcut,
        label: action,
        kind: "action",
        action,
      });
    }

    const config = getCharactersConfig();
    for (const [pseudo, rawShortcut] of Object.entries(config.shortcuts)) {
      const shortcut = normalizeShortcut(rawShortcut);
      if (!shortcut) {
        continue;
      }
      bindings.push({
        shortcut,
        label: pseudo,
        kind: "character",
        pseudo,
      });
    }

    return bindings;
  }

  private bindingErrors(bindings: ShortcutBinding[]): string[] {
    const errors: string[] = [];
    const byShortcut = new Map<string, ShortcutBinding[]>();

    for (const binding of bindings) {
      if (!this.isSupportedShortcut(binding.shortcut)) {
        errors.push(`${binding.label}: combinaison non supportee sur cette machine.`);
        continue;
      }
      const siblings = byShortcut.get(binding.shortcut) ?? [];
      siblings.push(binding);
      byShortcut.set(binding.shortcut, siblings);
    }

    for (const [shortcut, siblings] of byShortcut.entries()) {
      if (siblings.length < 2) {
        continue;
      }
      if (siblings.every((binding) => binding.kind === "character")) {
        continue;
      }
      errors.push(`[${shortcut}] deja utilise par ${siblings.map((binding) => binding.label).join(", ")}.`);
    }

    return errors;
  }

  private findShortcutConflict(shortcut: string, excludedPseudo: string): ShortcutBinding | null {
    const normalizedPseudo = excludedPseudo.trim().toLowerCase();
    for (const binding of this.collectBindings()) {
      if (binding.shortcut !== shortcut) {
        continue;
      }
      if (binding.kind === "character") {
        if (binding.pseudo?.trim().toLowerCase() === normalizedPseudo) {
          continue;
        }
        continue;
      }
      return binding;
    }
    return null;
  }

  private recognizedTarget(shortcut: string): ShortcutTarget {
    const matches = this.collectBindings().filter((binding) => this.isSupportedShortcut(binding.shortcut) && binding.shortcut === shortcut);
    if (!matches.length) {
      return { kind: "none" };
    }
    if (matches.length === 1) {
      const [binding] = matches;
      if (binding.kind === "action" && binding.action) {
        return { kind: "action", action: binding.action };
      }
      if (binding.kind === "character" && binding.pseudo) {
        return { kind: "character", pseudo: binding.pseudo };
      }
      return { kind: "none" };
    }

    if (matches.every((binding) => binding.kind === "character" && binding.pseudo)) {
      return {
        kind: "character-group",
        pseudos: matches.map((binding) => binding.pseudo!).filter(Boolean),
      };
    }

    return {
      kind: "ambiguous",
      message: `[${shortcut}] deja utilise par ${matches.map((binding) => binding.label).join(", ")}.`,
    };
  }
}

export const shortcutsService = new ShortcutsService();


