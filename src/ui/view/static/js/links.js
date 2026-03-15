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
          <span class="drag-handle" aria-hidden="true" title="Glissez-deposez pour reordonner.">:::</span>
          <div>
            <h4>${escapeHtml(group.name)}</h4>
            <div class="link-folder-meta">${group.links.length} lien${group.links.length > 1 ? 's' : ''}</div>
          </div>
        </div>
        <div class="link-folder-actions">
          ${renderIconButton('toggle-collapse', group.collapsed ? 'Affiche les liens de ce dossier.' : 'Masque les liens de ce dossier.', 'visibility-btn', group.collapsed ? 'eye-off' : 'eye')}
          <button class="ghost-btn ghost-btn-small" data-action="add-link" title="Ajoute un nouveau lien dans ce dossier.">Ajouter</button>
          ${renderIconButton('rename', 'Renomme ce dossier.')}
          ${renderIconButton('delete', 'Supprime ce dossier et tous ses liens.', 'danger-btn')}
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
            <span class="drag-handle" aria-hidden="true" title="Glissez-deposez pour reordonner.">:::</span>
            <button class="link-open" type="button" title="Ouvre ce lien dans le navigateur. ${escapeHtml(link.url)}">
              <span class="link-label">${escapeHtml(link.label)}</span>
              <span class="link-url">${escapeHtml(link.url)}</span>
            </button>
          </div>
          <div class="link-row-actions">
            ${renderIconButton('edit', 'Modifie ce lien.')}
            ${renderIconButton('delete', 'Supprime ce lien.', 'danger-btn')}
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
