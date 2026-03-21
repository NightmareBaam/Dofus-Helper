import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { charactersStorage, getCharactersConfig, listManagedCharacterWindows, listOrderedCharacterWindows } from "./charactersStorage.js";
import { focusTrackerService } from "./focusTrackerService.js";
import { readShortcutsConfig, writeShortcutsConfig, type ShortcutStatus, type ShortcutValues } from "./shortcutConfigStorage.js";
import { runtimeStateService } from "./runtimeStateService.js";

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
  | { kind: "action"; action: ShortcutAction }
  | { kind: "character"; pseudo: string };

const SHORTCUT_MODIFIERS = ["ctrl", "shift", "alt"] as const;
const SHORTCUT_MOUSE_BUTTONS = new Set(["mouse:left", "mouse:middle", "mouse:right", "mouse:x1", "mouse:x2"]);
const SUPPORTED_TERMINAL_KEYS = new Set<string>([
  "left", "right", "up", "down", "esc", "space", "enter", "tab", "delete", "backspace", "home", "end", "pageup", "pagedown", "insert",
  "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12",
  "²",
  ..."abcdefghijklmnopqrstuvwxyz0123456789".split(""),
]);
const POLLER_WATCHES: Array<{ vk: number; key: string }> = [
  { vk: 0x25, key: "left" },
  { vk: 0x27, key: "right" },
  { vk: 0x26, key: "up" },
  { vk: 0x28, key: "down" },
  { vk: 0x1B, key: "esc" },
  { vk: 0x20, key: "space" },
  { vk: 0x0D, key: "enter" },
  { vk: 0x09, key: "tab" },
  { vk: 0x2E, key: "delete" },
  { vk: 0x08, key: "backspace" },
  { vk: 0x24, key: "home" },
  { vk: 0x23, key: "end" },
  { vk: 0x21, key: "pageup" },
  { vk: 0x22, key: "pagedown" },
  { vk: 0x2D, key: "insert" },
  { vk: 0x70, key: "f1" },
  { vk: 0x71, key: "f2" },
  { vk: 0x72, key: "f3" },
  { vk: 0x73, key: "f4" },
  { vk: 0x74, key: "f5" },
  { vk: 0x75, key: "f6" },
  { vk: 0x76, key: "f7" },
  { vk: 0x77, key: "f8" },
  { vk: 0x78, key: "f9" },
  { vk: 0x79, key: "f10" },
  { vk: 0x7A, key: "f11" },
  { vk: 0x7B, key: "f12" },
  { vk: 0xC0, key: "²" },
  { vk: 0x41, key: "a" },
  { vk: 0x42, key: "b" },
  { vk: 0x43, key: "c" },
  { vk: 0x44, key: "d" },
  { vk: 0x45, key: "e" },
  { vk: 0x46, key: "f" },
  { vk: 0x47, key: "g" },
  { vk: 0x48, key: "h" },
  { vk: 0x49, key: "i" },
  { vk: 0x4A, key: "j" },
  { vk: 0x4B, key: "k" },
  { vk: 0x4C, key: "l" },
  { vk: 0x4D, key: "m" },
  { vk: 0x4E, key: "n" },
  { vk: 0x4F, key: "o" },
  { vk: 0x50, key: "p" },
  { vk: 0x51, key: "q" },
  { vk: 0x52, key: "r" },
  { vk: 0x53, key: "s" },
  { vk: 0x54, key: "t" },
  { vk: 0x55, key: "u" },
  { vk: 0x56, key: "v" },
  { vk: 0x57, key: "w" },
  { vk: 0x58, key: "x" },
  { vk: 0x59, key: "y" },
  { vk: 0x5A, key: "z" },
  { vk: 0x30, key: "0" },
  { vk: 0x31, key: "1" },
  { vk: 0x32, key: "2" },
  { vk: 0x33, key: "3" },
  { vk: 0x34, key: "4" },
  { vk: 0x35, key: "5" },
  { vk: 0x36, key: "6" },
  { vk: 0x37, key: "7" },
  { vk: 0x38, key: "8" },
  { vk: 0x39, key: "9" },
  { vk: 0x01, key: "mouse:left" },
  { vk: 0x02, key: "mouse:right" },
  { vk: 0x04, key: "mouse:middle" },
  { vk: 0x05, key: "mouse:x1" },
  { vk: 0x06, key: "mouse:x2" },
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

function buildPollerScript(): string {
  const watches = POLLER_WATCHES.map((item) => `@{ Vk = ${item.vk}; Key = '${item.key}' }`).join(",\n  ");
  return [
    'Add-Type @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class Win32Input {',
    '  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);',
    '}',
    '"@',
    '$watches = @(',
    `  ${watches}`,
    ')',
    '$state = @{}',
    'foreach ($item in $watches) { $state[$item.Key] = $false }',
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
    'while ($true) {',
    '  $mods = New-Object System.Collections.Generic.List[string]',
    '  if (Test-Key $modifierKeys.ctrl) { $mods.Add("ctrl") | Out-Null }',
    '  if (Test-Key $modifierKeys.shift) { $mods.Add("shift") | Out-Null }',
    '  if (Test-Key $modifierKeys.alt) { $mods.Add("alt") | Out-Null }',
    '  foreach ($item in $watches) {',
    '    $pressed = Test-Key @($item.Vk)',
    '    $previous = [bool]$state[$item.Key]',
    '    if ($pressed -and -not $previous) {',
    '      $parts = New-Object System.Collections.Generic.List[string]',
    '      foreach ($modifier in $mods) { $parts.Add($modifier) | Out-Null }',
    '      $parts.Add([string]$item.Key) | Out-Null',
    '      [Console]::Out.WriteLine(($parts -join "+"))',
    '      [Console]::Out.Flush()',
    '    }',
    '    $state[$item.Key] = $pressed',
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
    if (!["next", "prev", "last", "refresh"].includes(action)) {
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
    const recognized = target !== null;

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

    if (!target) {
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
        }
      } else {
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
      if (binding.kind === "character" && binding.pseudo?.trim().toLowerCase() === normalizedPseudo) {
        continue;
      }
      return binding;
    }
    return null;
  }

  private recognizedTarget(shortcut: string): ShortcutTarget | null {
    const matches = this.collectBindings().filter((binding) => this.isSupportedShortcut(binding.shortcut) && binding.shortcut === shortcut);
    if (matches.length !== 1) {
      return null;
    }
    const [binding] = matches;
    if (binding.kind === "action" && binding.action) {
      return { kind: "action", action: binding.action };
    }
    if (binding.kind === "character" && binding.pseudo) {
      return { kind: "character", pseudo: binding.pseudo };
    }
    return null;
  }
}

export const shortcutsService = new ShortcutsService();


