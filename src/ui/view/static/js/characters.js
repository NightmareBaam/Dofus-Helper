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
    const rotationEnabled = character.rule.rotation !== false;
    row.innerHTML = `
      <div class="character-index">${String(index + 1).padStart(2, '0')}</div>
      <div class="character-main">
        <div class="character-title">${escapeHtml(character.pseudo)} ${titleSuffix}</div>
        <div class="character-mode ${modeClass}">${character.gameType.toUpperCase()}</div>
      </div>
      <div class="character-actions">
        <button class="icon-btn rotation-btn${rotationEnabled ? '' : ' is-off'}" data-action="toggle-rotation" title="${getRotationTooltip(rotationEnabled)}" aria-label="${getRotationTooltip(rotationEnabled)}">${renderIcon(rotationEnabled ? 'rotation-on' : 'rotation-off')}</button>
        <button class="focus-btn" data-hwnd="${character.hwnd}" title="Place cette fenetre au premier plan.">Focus</button>
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
        button.title = getAutofocusTooltip(notifType, enabled);
        button.setAttribute('aria-label', getAutofocusTooltip(notifType, enabled));
        button.innerHTML = `<img alt="${notifType}" src="${state.bootstrap.assets.autofocus[notifType][enabled ? 'on' : 'off']}">`;
        button.addEventListener('click', async () => {
          const next = !(character.rule[notifType] !== false);
          character.rule[notifType] = next;
          button.querySelector('img').src = state.bootstrap.assets.autofocus[notifType][next ? 'on' : 'off'];
          button.title = getAutofocusTooltip(notifType, next);
          button.setAttribute('aria-label', getAutofocusTooltip(notifType, next));
          await window.pywebview.api.set_character_rule(character.pseudo, notifType, next);
        });
        actions.appendChild(button);
      }
    }

    row.querySelector('[data-action="toggle-rotation"]').addEventListener('click', async () => {
      const next = !rotationEnabled;
      const payload = await window.pywebview.api.set_character_rotation(character.pseudo, next);
      character.rule = payload.rule;
      renderCharacters();
      updateStatus(next ? 'Personnage reintegre au roulement' : 'Personnage exclu du roulement');
    });

    row.querySelector('.focus-btn').addEventListener('click', async () => {
      const result = await window.pywebview.api.focus_window(character.hwnd);
      updateStatus(result.ok ? 'Focus envoye' : result.message);
    });

    list.appendChild(row);
  });
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

async function setCopyMpSender(enabled) {
  const payload = await window.pywebview.api.set_copy_mp_sender(enabled);
  state.bootstrap.config = payload.config;
  updateStatus(`Copie MP ${enabled ? 'activee' : 'desactivee'}`);
}

