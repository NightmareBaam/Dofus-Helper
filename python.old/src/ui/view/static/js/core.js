const state = {
  bootstrap: null,
  windows: [],
  dirtyOrder: null,
  dirtyLinkGroupOrder: null,
  dirtyLinkOrders: {},
  dirtyCraftOrder: null,
  shortcuts: null,
  links: [],
  crafts: [],
  shortcutEvents: [],
  lastShortcutEventId: 0,
  captureAction: null,
  pollHandle: null,
  craftForm: { mode: null, craftId: null },
  craftCatalogState: { available: false, message: '' },
  resourceForm: { craftId: null, resourceId: null },
};

const viewMeta = {
  characters: ['Personnages', 'Gestion des fenetres Dofus et regles AutoFocus par personnage.'],
  shortcuts: ['Raccourcis', 'Configuration des hooks globaux clavier et souris.'],
  links: ['Liens utiles', 'Ajoute, supprime et reorganise tes liens par dossier.'],
  crafts: ['Calculette craft', 'Compare le cout des ressources au prix de vente HDV des objets craftes.'],
  info: ['Info', 'Version, mentions legales et etat de la migration webview.'],
};

const shortcutMeta = {
  next: ['Fenetre suivante', 'Passe au personnage suivant.'],
  prev: ['Fenetre precedente', 'Revient au personnage precedent.'],
  last: ['Dernier focus', 'Revient sur la derniere fenetre Dofus active.'],
  refresh: ['Actualiser les fenetres', 'Relance la detection des fenetres du jeu.'],
};

const autofocusMeta = {
  combat: 'Active le focus automatique quand c\'est au tour de ce personnage.',
  echange: 'Active le focus automatique quand ce personnage recoit une proposition d\'echange.',
  groupe: 'Active le focus automatique quand ce personnage recoit une invitation de groupe.',
  mp: 'Active le focus automatique quand ce personnage recoit un message prive.',
};

async function main() {
  bindNavigation();
  bindToolbar();
  const bootstrap = await window.pywebview.api.bootstrap();
  state.bootstrap = bootstrap;
  state.windows = bootstrap.windows;
  state.shortcuts = bootstrap.shortcutsState;
  state.links = bootstrap.links;
  state.crafts = bootstrap.crafts;
  state.craftCatalogState = bootstrap.craftCatalogState || { available: false, message: 'Catalogue craft indisponible.' };
  hydrateStaticViews(bootstrap);
  renderCharacters();
  renderShortcutsRows();
  renderLinks();
  renderCrafts();
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
  document.getElementById('copy-mp-toggle').addEventListener('change', (event) => setCopyMpSender(event.target.checked));

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
  document.getElementById('add-craft-header-btn').addEventListener('click', openCreateCraftForm);
  document.getElementById('expand-all-crafts-btn').addEventListener('click', () => setAllCraftsCollapsed(false));
  document.getElementById('collapse-all-crafts-btn').addEventListener('click', () => setAllCraftsCollapsed(true));
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

  if (Array.isArray(payload.windows)) {
    state.windows = payload.windows;
    state.dirtyOrder = null;
    renderCharacters();
    updateStatus('Liste actualisee');
  }
}

function switchView(view) {
  document.querySelectorAll('.nav-link').forEach((item) => item.classList.toggle('is-active', item.dataset.view === view));
  document.querySelectorAll('.view').forEach((item) => item.classList.toggle('is-active', item.dataset.view === view));
  const [title, subtitle] = viewMeta[view];
  document.getElementById('view-title').textContent = title;
  document.getElementById('view-subtitle').textContent = subtitle;
  document.getElementById('add-link-group-btn').classList.toggle('hidden', view !== 'links');
  document.getElementById('craft-header-actions').classList.toggle('hidden', view !== 'crafts');
}

function hydrateStaticViews(bootstrap) {
  document.getElementById('brand-logo').src = bootstrap.assets.logo;
  document.getElementById('retro-toggle').checked = bootstrap.config.enableRetro;
  document.getElementById('unity-toggle').checked = bootstrap.config.enableUnity;
  document.getElementById('copy-mp-toggle').checked = !!bootstrap.config.copyMpSender;
  document.getElementById('info-version').textContent = `Version: ${bootstrap.version}`;
  document.getElementById('legal-text').textContent = bootstrap.legal;
}


function renderIconButton(action, label, extraClass = '', iconKey = action) {
  const className = ['icon-btn', 'link-action-btn', extraClass].filter(Boolean).join(' ');
  return `<button class="${className}" type="button" data-action="${action}" title="${label}" aria-label="${label}">${renderIcon(iconKey)}</button>`;
}

function renderIcon(action) {
  const icons = {
    'rotation-on': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7"></path><path d="M20 4v6h-6"></path></svg>',
    'rotation-off': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7"></path><path d="M20 4v6h-6"></path><path d="M4 4l16 16"></path></svg>',
    rename: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4.2-1 9.1-9.1-3.2-3.2L5 15.8 4 20z"></path><path d="M13.9 6.7l3.2 3.2"></path></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4.2-1 9.1-9.1-3.2-3.2L5 15.8 4 20z"></path><path d="M13.9 6.7l3.2 3.2"></path></svg>',
    delete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14"></path><path d="M9 7V4h6v3"></path><path d="M8 7l1 12h6l1-12"></path><path d="M10 10v6"></path><path d="M14 10v6"></path></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    'eye-off': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"></path><path d="M10.6 6.3A11.4 11.4 0 0 1 12 6c6.5 0 10 6 10 6a18.7 18.7 0 0 1-4 4.6"></path><path d="M6.7 6.8C3.8 8.7 2 12 2 12s3.5 6 10 6c1.8 0 3.3-.4 4.6-1"></path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path></svg>',
  };
  return icons[action] || '';
}


function getAutofocusTooltip(notifType, enabled) {
  const description = autofocusMeta[notifType] || 'Option de focus automatique pour ce type de notification.';
  return `${description} Etat actuel : ${enabled ? 'active' : 'desactive'}.`;
}

function getRotationTooltip(enabled) {
  return enabled
    ? 'Ce personnage participe au roulement du focus automatique.'
    : 'Ce personnage est exclu du roulement du focus automatique.';
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


