const state = {
  bootstrap: null,
  windows: [],
  dirtyOrder: null,
  dirtyLinkGroupOrder: null,
  dirtyLinkOrders: {},
  shortcuts: null,
  links: [],
  shortcutEvents: [],
  lastShortcutEventId: 0,
  captureAction: null,
  pollHandle: null,
};

const viewMeta = {
  characters: ['Personnages', 'Gestion des fenetres Dofus et regles AutoFocus par personnage.'],
  shortcuts: ['Raccourcis', 'Configuration des hooks globaux clavier et souris.'],
  links: ['Liens utiles', 'Ajoute, supprime et reorganise tes liens par dossier.'],
  info: ['Info', 'Version, mentions legales et etat de la migration webview.'],
};

const shortcutMeta = {
  next: ['Fenetre suivante', 'Passe au personnage suivant.'],
  prev: ['Fenetre precedente', 'Revient au personnage precedent.'],
  last: ['Dernier focus', 'Revient sur la derniere fenetre Dofus active.'],
};

async function main() {
  bindNavigation();
  bindToolbar();
  const bootstrap = await window.pywebview.api.bootstrap();
  state.bootstrap = bootstrap;
  state.windows = bootstrap.windows;
  state.shortcuts = bootstrap.shortcutsState;
  state.links = bootstrap.links;
  hydrateStaticViews(bootstrap);
  renderCharacters();
  renderShortcutsRows();
  renderLinks();
  syncShortcutsState();
  renderShortcutDebugEvents([], true);
  startPolling();
  updateStatus('Pret');
}

function bindNavigation() {
  document.querySelectorAll('.nav-link').forEach((button) => {
    button.addEventListener('click', () => switchView(button.dataset.view));
  });
}

function bindToolbar() {
  document.getElementById('refresh-btn').addEventListener('click', refreshCharacters);
  document.getElementById('retro-toggle').addEventListener('change', (event) => setFilter('retro', event.target.checked));
  document.getElementById('unity-toggle').addEventListener('change', (event) => setFilter('unity', event.target.checked));

  document.getElementById('apply-shortcuts-btn').addEventListener('click', applyShortcuts);
  document.getElementById('shortcuts-debug-toggle').addEventListener('change', async (event) => {
    const payload = await window.pywebview.api.set_shortcuts_debug(event.target.checked);
    state.shortcuts = payload.shortcutsState;
    syncShortcutsState();
  });
  document.getElementById('clear-shortcuts-log-btn').addEventListener('click', () => {
    state.shortcutEvents = [];
    renderShortcutDebugEvents([], true);
  });

  document.getElementById('add-link-group-btn').addEventListener('click', addLinkGroup);
}

function startPolling() {
  if (state.pollHandle !== null) {
    window.clearInterval(state.pollHandle);
  }
  state.pollHandle = window.setInterval(() => {
    void pollRuntime();
  }, 400);
}

async function pollRuntime() {
  const payload = await window.pywebview.api.poll_runtime(state.lastShortcutEventId, 0);
  state.shortcuts = payload.shortcutsState;
  syncShortcutsState();

  if (payload.shortcutEvents.length) {
    state.shortcutEvents.push(...payload.shortcutEvents);
    state.lastShortcutEventId = Number(payload.shortcutEvents[payload.shortcutEvents.length - 1].id);
    renderShortcutDebugEvents(payload.shortcutEvents, false);
  }
}

function switchView(view) {
  document.querySelectorAll('.nav-link').forEach((item) => item.classList.toggle('is-active', item.dataset.view === view));
  document.querySelectorAll('.view').forEach((item) => item.classList.toggle('is-active', item.dataset.view === view));
  const [title, subtitle] = viewMeta[view];
  document.getElementById('view-title').textContent = title;
  document.getElementById('view-subtitle').textContent = subtitle;
  document.getElementById('add-link-group-btn').classList.toggle('hidden', view !== 'links');
}

function hydrateStaticViews(bootstrap) {
  document.getElementById('brand-logo').src = bootstrap.assets.logo;
  document.getElementById('retro-toggle').checked = bootstrap.config.enableRetro;
  document.getElementById('unity-toggle').checked = bootstrap.config.enableUnity;
  document.getElementById('info-version').textContent = `Version: ${bootstrap.version}`;
  document.getElementById('legal-text').textContent = bootstrap.legal;
}

function renderCharacters() {
  const list = document.getElementById('characters-list');
  list.innerHTML = '';

  if (!state.windows.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Aucune fenetre Dofus detectee.';
    list.appendChild(empty);
    return;
  }

  const unityWindowCount = state.windows.filter((item) => item.gameType === 'unity').length;
  state.windows.forEach((character, index) => {
    const row = document.createElement('article');
    row.className = 'character-row';
    row.draggable = true;
    row.dataset.hwnd = String(character.hwnd);
    row.addEventListener('dragstart', () => row.classList.add('dragging'));
    row.addEventListener('dragend', async () => {
      row.classList.remove('dragging');
      await persistOrderIfDirty();
    });
    row.addEventListener('dragover', (event) => {
      event.preventDefault();
      const dragging = document.querySelector('.character-row.dragging');
      if (!dragging || dragging === row) {
        return;
      }
      const parent = row.parentElement;
      const rect = row.getBoundingClientRect();
      const insertBefore = event.clientY < rect.top + rect.height / 2;
      parent.insertBefore(dragging, insertBefore ? row : row.nextSibling);
      state.dirtyOrder = Array.from(parent.querySelectorAll('.character-row')).map((item) => Number(item.dataset.hwnd));
    });

    const titleSuffix = character.gameType === 'unity' && character.classe ? `<span class="character-class">&middot; ${escapeHtml(character.classe)}</span>` : '';
    const modeClass = character.gameType === 'retro' ? 'retro' : 'unity';
    row.innerHTML = `
      <div class="character-index">${String(index + 1).padStart(2, '0')}</div>
      <div class="character-main">
        <div class="character-title">${escapeHtml(character.pseudo)} ${titleSuffix}</div>
        <div class="character-mode ${modeClass}">${character.gameType.toUpperCase()}</div>
      </div>
      <div class="character-actions">
        <button class="focus-btn" data-hwnd="${character.hwnd}">Focus</button>
      </div>
    `;

    const showAutofocusButtons = character.gameType !== 'unity' || unityWindowCount <= 1;
    const actions = row.querySelector('.character-actions');
    if (showAutofocusButtons) {
      for (const notifType of state.bootstrap.availableTypes) {
        const button = document.createElement('button');
        button.className = 'icon-btn';
        button.dataset.type = notifType;
        const enabled = character.rule[notifType] !== false;
        button.innerHTML = `<img alt="${notifType}" src="${state.bootstrap.assets.autofocus[notifType][enabled ? 'on' : 'off']}">`;
        button.addEventListener('click', async () => {
          const next = !(character.rule[notifType] !== false);
          character.rule[notifType] = next;
          button.querySelector('img').src = state.bootstrap.assets.autofocus[notifType][next ? 'on' : 'off'];
          await window.pywebview.api.set_character_rule(character.pseudo, notifType, next);
        });
        actions.appendChild(button);
      }
    }

    row.querySelector('.focus-btn').addEventListener('click', async () => {
      const result = await window.pywebview.api.focus_window(character.hwnd);
      updateStatus(result.ok ? 'Focus envoye' : result.message);
    });

    list.appendChild(row);
  });
}

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
        <input class="shortcut-input" readonly value="${formatShortcutValue(action, activeCapture)}">
        <button class="capture-btn" data-action="${action}">${activeCapture ? 'Ecoute...' : 'Capturer'}</button>
        <button class="clear-btn" data-action="${action}">Aucun</button>
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

function renderLinks() {
  const container = document.getElementById('links-groups');
  container.innerHTML = '';

  if (!state.links.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Aucun dossier de liens. Cree-en un nouveau.';
    container.appendChild(empty);
    return;
  }

  state.links.forEach((group) => {
    const card = document.createElement('section');
    card.className = `link-folder${group.collapsed ? ' is-collapsed' : ''}`;
    card.draggable = true;
    card.dataset.groupId = group.id;
    card.innerHTML = `
      <div class="link-folder-head">
        <div class="link-folder-title">
          <span class="drag-handle" aria-hidden="true">:::</span>
          <div>
            <h4>${escapeHtml(group.name)}</h4>
            <div class="link-folder-meta">${group.links.length} lien${group.links.length > 1 ? 's' : ''}</div>
          </div>
        </div>
        <div class="link-folder-actions">
          ${renderIconButton('toggle-collapse', group.collapsed ? 'Afficher les liens' : 'Masquer les liens', 'visibility-btn', group.collapsed ? 'eye-off' : 'eye')}
          <button class="ghost-btn ghost-btn-small" data-action="add-link">Ajouter</button>
          ${renderIconButton('rename', 'Renommer')}
          ${renderIconButton('delete', 'Supprimer', 'danger-btn')}
        </div>
      </div>
      <div class="link-list"></div>
    `;
    bindLinkGroupDrag(card);

    card.querySelector('[data-action="toggle-collapse"]').addEventListener('click', () => toggleLinkGroupCollapsed(group));
    card.querySelector('[data-action="rename"]').addEventListener('click', () => renameLinkGroup(group));
    card.querySelector('[data-action="add-link"]').addEventListener('click', () => addLink(group.id));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteLinkGroup(group));

    const list = card.querySelector('.link-list');
    list.classList.toggle('hidden', !!group.collapsed);
    if (!group.links.length) {
      const empty = document.createElement('div');
      empty.className = 'link-empty';
      empty.textContent = 'Aucun lien dans ce dossier.';
      list.appendChild(empty);
    } else {
      group.links.forEach((link) => {
        const row = document.createElement('div');
        row.className = 'link-row';
        row.draggable = true;
        row.dataset.linkId = link.id;
        row.innerHTML = `
          <div class="link-row-main">
            <span class="drag-handle" aria-hidden="true">:::</span>
            <button class="link-open" type="button" title="${escapeHtml(link.url)}">
              <span class="link-label">${escapeHtml(link.label)}</span>
              <span class="link-url">${escapeHtml(link.url)}</span>
            </button>
          </div>
          <div class="link-row-actions">
            ${renderIconButton('edit', 'Modifier')}
            ${renderIconButton('delete', 'Supprimer', 'danger-btn')}
          </div>
        `;
        bindLinkRowDrag(row, group.id);
        row.querySelector('.link-open').addEventListener('click', async () => {
          await window.pywebview.api.open_link(link.url);
        });
        row.querySelector('[data-action="edit"]').addEventListener('click', () => editLink(group.id, link));
        row.querySelector('[data-action="delete"]').addEventListener('click', () => deleteLink(group.id, link));
        list.appendChild(row);
      });
    }

    container.appendChild(card);
  });
}

function bindLinkGroupDrag(card) {
  card.addEventListener('dragstart', (event) => {
    card.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.dataset.groupId);
  });
  card.addEventListener('dragend', async () => {
    card.classList.remove('dragging');
    await persistLinkGroupOrderIfDirty();
  });
  card.addEventListener('dragover', (event) => {
    event.preventDefault();
    const parent = card.parentElement;
    const dragging = parent?.querySelector('.link-folder.dragging');
    if (!dragging || dragging === card) {
      return;
    }
    const rect = card.getBoundingClientRect();
    const insertBefore = event.clientY < rect.top + rect.height / 2;
    parent.insertBefore(dragging, insertBefore ? card : card.nextSibling);
    state.dirtyLinkGroupOrder = Array.from(parent.querySelectorAll('.link-folder')).map((item) => item.dataset.groupId);
  });
}

function bindLinkRowDrag(row, groupId) {
  row.addEventListener('dragstart', (event) => {
    row.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', row.dataset.linkId);
  });
  row.addEventListener('dragend', async () => {
    row.classList.remove('dragging');
    await persistLinkOrderIfDirty(groupId);
  });
  row.addEventListener('dragover', (event) => {
    event.preventDefault();
    const parent = row.parentElement;
    const dragging = parent?.querySelector('.link-row.dragging');
    if (!dragging || dragging === row) {
      return;
    }
    const rect = row.getBoundingClientRect();
    const insertBefore = event.clientY < rect.top + rect.height / 2;
    parent.insertBefore(dragging, insertBefore ? row : row.nextSibling);
    state.dirtyLinkOrders[groupId] = Array.from(parent.querySelectorAll('.link-row')).map((item) => item.dataset.linkId);
  });
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

async function refreshCharacters() {
  const payload = await window.pywebview.api.refresh_windows();
  state.windows = payload.windows;
  state.dirtyOrder = null;
  renderCharacters();
  updateStatus('Liste actualisee');
}

async function persistOrderIfDirty() {
  if (!state.dirtyOrder) {
    return;
  }
  const payload = await window.pywebview.api.save_order(state.dirtyOrder);
  state.windows = payload.windows;
  state.dirtyOrder = null;
  renderCharacters();
  updateStatus('Ordre applique');
}

async function setFilter(gameType, enabled) {
  const payload = await window.pywebview.api.set_game_filter(gameType, enabled);
  state.bootstrap.config = payload.config;
  state.windows = payload.windows;
  state.dirtyOrder = null;
  renderCharacters();
  updateStatus(`Filtre ${gameType} mis a jour`);
}

async function applyShortcuts() {
  stopShortcutCapture();
  const payload = await window.pywebview.api.apply_shortcuts();
  state.shortcuts = payload.shortcutsState;
  syncShortcutsState();
}

async function addLinkGroup() {
  const name = window.prompt('Nom du nouveau dossier :', 'Nouveau dossier');
  if (name === null) {
    return;
  }
  await applyLinksPayload(await window.pywebview.api.add_link_group(name), 'Dossier ajoute');
}

async function renameLinkGroup(group) {
  const name = window.prompt('Nouveau nom du dossier :', group.name);
  if (name === null) {
    return;
  }
  await applyLinksPayload(await window.pywebview.api.rename_link_group(group.id, name), 'Dossier renomme');
}

async function deleteLinkGroup(group) {
  if (!window.confirm(`Supprimer le dossier "${group.name}" et tous ses liens ?`)) {
    return;
  }
  await applyLinksPayload(await window.pywebview.api.delete_link_group(group.id), 'Dossier supprime');
}

async function toggleLinkGroupCollapsed(group) {
  await applyLinksPayload(await window.pywebview.api.set_link_group_collapsed(group.id, !group.collapsed), group.collapsed ? 'Dossier affiche' : 'Dossier masque');
}

async function addLink(groupId) {
  const label = window.prompt('Nom du lien :', 'Nouveau lien');
  if (label === null) {
    return;
  }
  const url = window.prompt('URL du lien :', 'https://');
  if (url === null) {
    return;
  }
  await applyLinksPayload(await window.pywebview.api.add_link(groupId, label, url), 'Lien ajoute');
}

async function editLink(groupId, link) {
  const label = window.prompt('Nom du lien :', link.label);
  if (label === null) {
    return;
  }
  const url = window.prompt('URL du lien :', link.url);
  if (url === null) {
    return;
  }
  await applyLinksPayload(await window.pywebview.api.update_link(groupId, link.id, label, url), 'Lien modifie');
}

async function deleteLink(groupId, link) {
  if (!window.confirm(`Supprimer le lien "${link.label}" ?`)) {
    return;
  }
  await applyLinksPayload(await window.pywebview.api.delete_link(groupId, link.id), 'Lien supprime');
}

async function applyLinksPayload(payload, successMessage) {
  if (!payload.ok) {
    updateStatus(payload.message || 'Operation impossible');
    return;
  }
  state.dirtyLinkGroupOrder = null;
  state.dirtyLinkOrders = {};
  state.links = payload.links;
  renderLinks();
  updateStatus(successMessage);
}

async function persistLinkGroupOrderIfDirty() {
  if (!state.dirtyLinkGroupOrder) {
    return;
  }
  const currentOrder = state.links.map((group) => group.id);
  const dirtyOrder = state.dirtyLinkGroupOrder;
  state.dirtyLinkGroupOrder = null;
  if (dirtyOrder.length === currentOrder.length && dirtyOrder.every((id, index) => id === currentOrder[index])) {
    return;
  }
  await applyLinksPayload(await window.pywebview.api.save_link_group_order(dirtyOrder), 'Ordre des dossiers mis a jour');
}

async function persistLinkOrderIfDirty(groupId) {
  const dirtyOrder = state.dirtyLinkOrders[groupId];
  if (!dirtyOrder) {
    return;
  }
  delete state.dirtyLinkOrders[groupId];
  const group = state.links.find((item) => item.id === groupId);
  const currentOrder = group ? group.links.map((link) => link.id) : [];
  if (dirtyOrder.length === currentOrder.length && dirtyOrder.every((id, index) => id === currentOrder[index])) {
    return;
  }
  await applyLinksPayload(await window.pywebview.api.save_link_order(groupId, dirtyOrder), 'Ordre des liens mis a jour');
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

function renderIconButton(action, label, extraClass = '', iconKey = action) {
  const className = ['icon-btn', 'link-action-btn', extraClass].filter(Boolean).join(' ');
  return `<button class="${className}" type="button" data-action="${action}" title="${label}" aria-label="${label}">${renderIcon(iconKey)}</button>`;
}

function renderIcon(action) {
  const icons = {
    rename: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4.2-1 9.1-9.1-3.2-3.2L5 15.8 4 20z"></path><path d="M13.9 6.7l3.2 3.2"></path></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4.2-1 9.1-9.1-3.2-3.2L5 15.8 4 20z"></path><path d="M13.9 6.7l3.2 3.2"></path></svg>',
    delete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14"></path><path d="M9 7V4h6v3"></path><path d="M8 7l1 12h6l1-12"></path><path d="M10 10v6"></path><path d="M14 10v6"></path></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    'eye-off': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"></path><path d="M10.6 6.3A11.4 11.4 0 0 1 12 6c6.5 0 10 6 10 6a18.7 18.7 0 0 1-4 4.6"></path><path d="M6.7 6.8C3.8 8.7 2 12 2 12s3.5 6 10 6c1.8 0 3.3-.4 4.6-1"></path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path></svg>',
  };
  return icons[action] || '';
}

function updateStatus(message) {
  document.getElementById('status-pill').textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

window.addEventListener('pywebviewready', main);
