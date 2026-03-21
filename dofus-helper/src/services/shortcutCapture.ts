function collectModifiers(event: KeyboardEvent | MouseEvent): string[] {
  const modifiers: string[] = [];
  if (event.ctrlKey) {
    modifiers.push("ctrl");
  }
  if (event.shiftKey) {
    modifiers.push("shift");
  }
  if (event.altKey) {
    modifiers.push("alt");
  }
  return modifiers;
}

function normalizeKeyName(rawKey: string): string | null {
  const aliases: Record<string, string> = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
    Escape: "esc",
    " ": "space",
    Enter: "enter",
    Tab: "tab",
    Delete: "delete",
    Backspace: "backspace",
    Home: "home",
    End: "end",
    PageUp: "pageup",
    PageDown: "pagedown",
    Insert: "insert",
  };
  if (aliases[rawKey]) {
    return aliases[rawKey];
  }
  const lowered = rawKey.toLowerCase();
  if (["control", "shift", "alt", "meta", "capslock"].includes(lowered)) {
    return null;
  }
  if (lowered.length === 1) {
    return lowered;
  }
  return lowered.split(" ").join("");
}

export function shortcutFromKeyboardEvent(event: KeyboardEvent): string | null {
  const key = normalizeKeyName(event.key);
  if (!key) {
    return null;
  }
  const modifiers = collectModifiers(event);
  if (modifiers.includes(key)) {
    return null;
  }
  return [...modifiers, key].join("+");
}

export function shortcutFromMouseEvent(event: MouseEvent): string | null {
  const buttonMap: Record<number, string> = {
    0: "mouse:left",
    1: "mouse:middle",
    2: "mouse:right",
    3: "mouse:x1",
    4: "mouse:x2",
  };
  const button = buttonMap[event.button];
  if (!button) {
    return null;
  }
  return [...collectModifiers(event), button].join("+");
}
