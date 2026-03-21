function renderShortcutsRows() {
  const container = document.getElementById('shortcut-rows');
  container.innerHTML = '';
  for (const [action, [title, subtitle]] of Object.entries(shortcutMeta)) {
    const row = document.createElement('div');
    const activeCapture = state.captureAction === action;
    row.className = `shortcut-row${activeCapture ? ' capture-active' : ''}`;
    row.innerHTML = `
      <div>
        <div class="shortcut-label">${title}</div>
        <div class="shortcut-subtitle">${subtitle}</div>
      </div>
      <div class="shortcut-actions">
        <input class="shortcut-input" readonly value="${formatShortcutValue(action, activeCapture)}" title="Raccourci actuellement configure pour cette action.">
        <button class="capture-btn" data-action="${action}" title="Ecoute la prochaine combinaison clavier ou souris pour cette action.">${activeCapture ? 'Ecoute...' : 'Capturer'}</button>
        <button class="clear-btn" data-action="${action}" title="Supprime le raccourci actuellement configure.">Aucun</button>
      </div>
    `;
    row.querySelector('.capture-btn').addEventListener('click', () => {
      if (state.captureAction === action) {
        stopShortcutCapture();
      } else {
        beginShortcutCapture(action);
      }
    });
    row.querySelector('.clear-btn').addEventListener('click', async () => {
      stopShortcutCapture();
      const payload = await window.pywebview.api.set_shortcut(action, null);
      state.shortcuts = payload.shortcutsState;
      renderShortcutsRows();
      syncShortcutsState();
    });
    container.appendChild(row);
  }
}

function syncShortcutsState() {
  document.getElementById('shortcuts-debug-toggle').checked = !!state.shortcuts.debugEnabled;
  document.getElementById('shortcuts-status').textContent = state.shortcuts.status.text || '';
  document.getElementById('shortcuts-status').className = `inline-status tone-${state.shortcuts.status.tone}`;
  document.getElementById('shortcut-debug-card').classList.toggle('hidden', !state.shortcuts.debugEnabled);
}

function renderShortcutDebugEvents(events, reset) {
  const log = document.getElementById('shortcut-debug-log');
  if (reset) {
    log.innerHTML = '';
  }
  const items = reset ? state.shortcutEvents : events;
  if (!items.length && !log.childElementCount) {
    log.innerHTML = '<div class="log-entry dim">Aucun evenement capture.</div>';
    return;
  }
  if (reset) {
    log.innerHTML = '';
  }
  for (const event of items) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${event.recognized ? 'ok' : 'warn'}`;
    entry.innerHTML = `<time>[${event.timestamp}]</time>${escapeHtml(event.shortcut)} - ${event.recognized ? 'Commande reconnue' : 'Commande non reconnue'}`;
    log.appendChild(entry);
  }
  log.scrollTop = log.scrollHeight;
}

async function applyShortcuts() {
  stopShortcutCapture();
  const payload = await window.pywebview.api.apply_shortcuts();
  state.shortcuts = payload.shortcutsState;
  syncShortcutsState();
}

function beginShortcutCapture(action) {
  state.captureAction = action;
  renderShortcutsRows();
  document.addEventListener('keydown', onCaptureKeydown, true);
  document.addEventListener('mousedown', onCaptureMousedown, true);
  document.addEventListener('contextmenu', preventCaptureContextMenu, true);
}

function stopShortcutCapture() {
  if (!state.captureAction) {
    return;
  }
  state.captureAction = null;
  document.removeEventListener('keydown', onCaptureKeydown, true);
  document.removeEventListener('mousedown', onCaptureMousedown, true);
  document.removeEventListener('contextmenu', preventCaptureContextMenu, true);
  renderShortcutsRows();
}

function preventCaptureContextMenu(event) {
  if (!state.captureAction) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

function onCaptureKeydown(event) {
  if (!state.captureAction) {
    return;
  }
  const combo = shortcutFromKeyboardEvent(event);
  event.preventDefault();
  event.stopPropagation();
  if (combo === null) {
    if (event.key === 'Escape') {
      stopShortcutCapture();
    }
    return;
  }
  void persistCapturedShortcut(combo);
}

function onCaptureMousedown(event) {
  if (!state.captureAction) {
    return;
  }
  const combo = shortcutFromMouseEvent(event);
  event.preventDefault();
  event.stopPropagation();
  if (combo === null) {
    return;
  }
  void persistCapturedShortcut(combo);
}

async function persistCapturedShortcut(combo) {
  const action = state.captureAction;
  stopShortcutCapture();
  const payload = await window.pywebview.api.set_shortcut(action, combo);
  state.shortcuts = payload.shortcutsState;
  renderShortcutsRows();
  syncShortcutsState();
}

function shortcutFromKeyboardEvent(event) {
  const key = normalizeKeyName(event.key);
  if (!key) {
    return null;
  }
  const modifiers = collectModifiers(event);
  if (modifiers.includes(key)) {
    return null;
  }
  return [...modifiers, key].join('+');
}

function shortcutFromMouseEvent(event) {
  const buttonMap = {
    0: 'mouse:left',
    1: 'mouse:middle',
    2: 'mouse:right',
    3: 'mouse:x1',
    4: 'mouse:x2',
  };
  const button = buttonMap[event.button];
  if (!button) {
    return null;
  }
  return [...collectModifiers(event), button].join('+');
}

function collectModifiers(event) {
  const modifiers = [];
  if (event.ctrlKey) {
    modifiers.push('ctrl');
  }
  if (event.shiftKey) {
    modifiers.push('shift');
  }
  if (event.altKey) {
    modifiers.push('alt');
  }
  return modifiers;
}

function normalizeKeyName(rawKey) {
  if (!rawKey) {
    return null;
  }
  const aliases = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    Escape: 'esc',
    ' ': 'space',
    Enter: 'enter',
    Tab: 'tab',
    Delete: 'delete',
    Backspace: 'backspace',
    Home: 'home',
    End: 'end',
    PageUp: 'page up',
    PageDown: 'page down',
    Insert: 'insert',
  };
  if (aliases[rawKey]) {
    return aliases[rawKey];
  }
  const lowered = rawKey.toLowerCase();
  if (['control', 'shift', 'alt', 'meta', 'capslock'].includes(lowered)) {
    return null;
  }
  if (lowered.length === 1) {
    return lowered;
  }
  return lowered.replaceAll(' ', '');
}

function formatShortcutValue(action, activeCapture) {
  if (activeCapture) {
    return 'Appuyez...';
  }
  return state.shortcuts.values[action] || 'Aucun';
}
