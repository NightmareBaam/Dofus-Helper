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

function normalizeKeyName(event: KeyboardEvent): string | null {
  const codeAliases: Record<string, string> = {
    Digit1: "&",
    Digit2: "é",
    Digit3: "\"",
    Digit4: "'",
    Digit5: "(",
    Digit6: "-",
    Digit7: "è",
    Digit8: "_",
    Digit9: "ç",
    Digit0: "à",
    Minus: ")",
    Equal: "=",
    Backquote: "²",
    BracketLeft: "^",
    BracketRight: "$",
    Backslash: "*",
    Quote: "ù",
    IntlBackslash: "<",
    Comma: ",",
    Period: ";",
    Slash: ":",
    Numpad0: "numpad0",
    Numpad1: "numpad1",
    Numpad2: "numpad2",
    Numpad3: "numpad3",
    Numpad4: "numpad4",
    Numpad5: "numpad5",
    Numpad6: "numpad6",
    Numpad7: "numpad7",
    Numpad8: "numpad8",
    Numpad9: "numpad9",
    NumpadDecimal: "numpaddecimal",
    NumpadDivide: "numpaddivide",
    NumpadMultiply: "numpadmultiply",
    NumpadSubtract: "numpadsubtract",
    NumpadAdd: "numpadadd",
    NumpadEnter: "enter",
  };
  if (codeAliases[event.code]) {
    return codeAliases[event.code];
  }

  const rawKey = event.key;
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
    Dead: "^",
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
  const key = normalizeKeyName(event);
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
