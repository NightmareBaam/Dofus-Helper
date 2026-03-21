function renderCrafts() {
  renderCraftForm();

  const container = document.getElementById('crafts-list');
  container.innerHTML = '';

  if (!state.crafts.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Aucun craft suivi. Ajoutez-en un nouveau pour commencer.';
    container.appendChild(empty);
    if (!state.craftCatalogState.available) {
      const warning = document.createElement('div');
      warning.className = 'hint-box craft-catalog-warning';
      warning.textContent = state.craftCatalogState.message || 'Catalogue craft indisponible.';
      container.appendChild(warning);
    }
    return;
  }

  state.crafts.forEach((craft) => {
    const totals = computeCraftTotals(craft);
    const collapsed = !!craft.collapsed;
    const profitClass = totals.profitTotal >= 0 ? 'is-positive' : 'is-negative';
    const unitProfitClass = totals.profitUnit >= 0 ? 'is-positive' : 'is-negative';
    const isEditingCraft = state.craftForm.mode === 'edit' && state.craftForm.craftId === craft.id;
    const isResourceFormOpen = state.resourceForm.craftId === craft.id;
    const editingResource = isResourceFormOpen && state.resourceForm.resourceId
      ? craft.resources.find((item) => item.id === state.resourceForm.resourceId) || null
      : null;
    const card = document.createElement('section');
    const sourceThemeClass = getCraftCardThemeClass(craft.item_source);
    card.draggable = true;
    card.dataset.craftId = craft.id;
    card.className = `craft-card${collapsed ? ' is-collapsed' : ''}${sourceThemeClass}`;
    card.innerHTML = `
      <div class="craft-head">
        <div class="craft-title">
          <span class="drag-handle" aria-hidden="true" title="Glissez-deposez pour reordonner ce craft.">:::</span>
          <div class="craft-title-main">
            <div class="craft-title-row">
              <h3>${craft.item_url ? `<button class="craft-title-link" type="button" data-action="open-craft-title" data-url="${escapeHtml(craft.item_url)}">${escapeHtml(craft.name)}</button>` : escapeHtml(craft.name)}</h3>
              <span class="craft-profit-pill ${unitProfitClass}">${formatSignedKamas(totals.profitUnit)} / item</span>
              ${renderCraftCardMeta(craft)}
            </div>
          </div>
        </div>
        <div class="craft-actions">
          ${renderIconButton('toggle-collapse', collapsed ? 'Affiche les informations de ce craft.' : 'Masque les informations de ce craft.', 'visibility-btn', collapsed ? 'eye-off' : 'eye')}
          <button class="ghost-btn ghost-btn-small" data-action="add-resource" title="Ajoute une ressource a ce craft.">Ajouter ressource</button>
          ${renderIconButton('edit', 'Modifie ce craft.', 'success-btn')}
          ${renderIconButton('delete', 'Supprime ce craft.', 'danger-btn')}
        </div>
      </div>
      ${isEditingCraft ? renderCraftEditor(craft) : ''}
      ${collapsed ? '' : `
        <div class="craft-metrics">
          <div class="craft-metric"><span>Prix HDV</span><strong>${formatKamas(totals.sellPrice)}</strong></div>
          <div class="craft-metric"><span>Cout / item</span><strong>${formatKamas(totals.unitCost)}</strong></div>
          <div class="craft-metric ${unitProfitClass}"><span>Marge / item</span><strong>${formatSignedKamas(totals.profitUnit)}</strong></div>
          <div class="craft-metric"><span>Cout total</span><strong>${formatKamas(totals.totalCost)}</strong></div>
          <div class="craft-metric ${profitClass}"><span>Benefice total</span><strong>${formatSignedKamas(totals.profitTotal)}</strong></div>
        </div>
        <div class="craft-target-row">
          <label class="craft-target-label">Quantite a craft
            <input class="craft-target-input" type="number" min="1" step="1" value="${totals.targetQuantity}">
          </label>
          <div class="craft-target-hint">${totals.targetQuantity} item${totals.targetQuantity > 1 ? 's' : ''} -> vente ${formatKamas(totals.revenue)}.</div>
        </div>
        <div class="craft-section-title">Ressources necessaires</div>
        <div class="craft-resource-list">
          ${totals.resources.length ? totals.resources.map((resource) => renderCraftResourceRow(resource, totals.targetQuantity)).join('') : '<div class="link-empty">Aucune ressource pour ce craft.</div>'}
        </div>
        ${isResourceFormOpen ? renderCraftResourceEditor(editingResource) : ''}
      `}
    `;
    bindCraftDrag(card);

    card.querySelector('[data-action="toggle-collapse"]').addEventListener('click', async () => {
      await applyCraftsPayload(await window.pywebview.api.set_craft_collapsed(craft.id, !collapsed), collapsed ? 'Craft affiche' : 'Craft masque');
    });
    card.querySelector('[data-action="add-resource"]').addEventListener('click', () => openCreateResourceForm(craft.id));
    card.querySelector('[data-action="edit"]').addEventListener('click', () => openEditCraftForm(craft.id));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteCraft(craft));
    card.querySelectorAll('.craft-card-meta [data-action="open-craft-link"]').forEach((button) => {
      button.addEventListener('click', async () => {
        await window.pywebview.api.open_link(button.dataset.url);
      });
    });
    card.querySelectorAll('[data-action="open-craft-title"]').forEach((button) => {
      button.addEventListener('click', async () => {
        await window.pywebview.api.open_link(button.dataset.url);
      });
    });

    const targetInput = card.querySelector('.craft-target-input');
    if (targetInput) {
      targetInput.addEventListener('change', async (event) => {
        await setCraftTargetQuantity(craft, event.target.value);
      });
    }

    card.querySelectorAll('.craft-resource-row').forEach((row) => {
      const resourceId = row.dataset.resourceId;
      const resource = craft.resources.find((item) => item.id === resourceId);
      if (!resource) {
        return;
      }
      row.querySelector('[data-action="delete"]').addEventListener('click', () => deleteCraftResource(craft.id, resource));
      row.querySelector('[data-action="toggle-include"]').addEventListener('click', async () => {
        await updateCraftResourceInline(craft.id, resource, { included: resource.included === false }, resource.included === false ? 'Ressource reintegree au calcul' : 'Ressource retiree du calcul');
      });
      row.querySelector('[data-action="set-unit-price"]').addEventListener('change', async (event) => {
        await updateCraftResourceInline(craft.id, resource, { unitPrice: event.target.value }, 'Prix unitaire de la ressource mis a jour');
      });
      row.querySelector('[data-action="set-owned-quantity"]').addEventListener('change', async (event) => {
        await updateCraftResourceInline(craft.id, resource, { ownedQuantity: event.target.value }, 'Stock de la ressource mis a jour');
      });
    });

    const craftForm = card.querySelector('[data-craft-form]');
    if (craftForm) {
      bindCraftForm(craftForm, craft);
    }

    const resourceForm = card.querySelector('[data-resource-form]');
    if (resourceForm) {
      bindResourceForm(resourceForm, craft.id, editingResource?.id || null);
    }

    container.appendChild(card);
  });
}

function formatCraftCategory(category) {
  const value = String(category || '').trim();
  if (!value) {
    return '';
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeCraftSource(source) {
  const value = String(source || '').trim().toLowerCase();
  if (value === 'retro' || value === 'unity') {
    return value;
  }
  return value ? 'unknown' : '';
}

function formatCraftSource(source) {
  const normalized = normalizeCraftSource(source);
  if (normalized === 'retro') {
    return 'Retro';
  }
  if (normalized === 'unity') {
    return 'Unity';
  }
  return normalized ? 'Autre' : '';
}

function renderCraftSourcePill(source) {
  const normalized = normalizeCraftSource(source);
  if (!normalized) {
    return '';
  }
  return `<span class="craft-meta-pill craft-source-pill is-${normalized}">${formatCraftSource(normalized)}</span>`;
}

function renderCraftSourceFilterButton(value, label, active) {
  return `<button class="craft-source-filter-btn${active ? ' is-active' : ''}" type="button" data-action="set-craft-source-filter" data-source-filter="${value}">${label}</button>`;
}

function getCraftCardThemeClass(source) {
  const normalized = normalizeCraftSource(source);
  if (normalized === 'retro' || normalized === 'unity') {
    return ` is-${normalized}-theme`;
  }
  return '';
}

function renderCraftMetaChip(label, url = '') {
  const safeLabel = String(label || '').trim();
  if (!safeLabel) {
    return '';
  }
  if (!url) {
    return `<span class="craft-meta-pill craft-meta-chip">${escapeHtml(safeLabel)}</span>`;
  }
  return `<button class="craft-meta-pill craft-meta-chip craft-meta-chip-link" type="button" data-action="open-craft-link" data-url="${escapeHtml(url)}">${escapeHtml(safeLabel)}</button>`;
}

function getCraftCatalogSelection(craft) {
  if (!craft || !craft.item_key) {
    return null;
  }
  return {
    key: String(craft.item_key || ''),
    name: String(craft.name || ''),
    category: String(craft.item_category || ''),
    source: String(craft.item_source || ''),
    level: Math.max(0, Number.parseInt(String(craft.item_level || 0), 10) || 0),
    url: String(craft.item_url || ''),
    panoplie: String(craft.item_panoplie || ''),
    panoplieUrl: String(craft.item_panoplie_url || ''),
    recipeCount: Array.isArray(craft.resources) ? craft.resources.length : 0,
  };
}

function renderCraftLinkButton(label, url) {
  if (!url) {
    return '';
  }
  return `<button class="ghost-btn ghost-btn-small" type="button" data-action="open-craft-link" data-url="${escapeHtml(url)}">${label}</button>`;
}

function renderCraftCardMeta(craft) {
  const meta = [];
  const categoryLabel = craft.item_category ? formatCraftCategory(craft.item_category) : '';
  const levelLabel = toNumber(craft.item_level) > 0 ? `Niv. ${formatCount(craft.item_level)}` : '';
  const categoryMeta = [categoryLabel, levelLabel].filter(Boolean).join(' ');
  if (categoryMeta) {
    meta.push(renderCraftMetaChip(categoryMeta));
  }
  if (craft.item_panoplie) {
    meta.push(renderCraftMetaChip(craft.item_panoplie, craft.item_panoplie_url));
  }
  const sourcePill = renderCraftSourcePill(craft.item_source);
  if (sourcePill) {
    meta.push(sourcePill);
  }
  if (!meta.length) {
    return '';
  }
  return `<div class="craft-card-meta">${meta.join('')}</div>`;
}

function renderCraftSelectedItem(item) {
  const meta = [renderCraftSourcePill(item.source)].filter(Boolean);
  if (item.category) {
    meta.push(`<span class="craft-meta-pill">${escapeHtml(formatCraftCategory(item.category))}</span>`);
  }
  if (toNumber(item.level) > 0) {
    meta.push(`<span class="craft-meta-pill">Niv. ${formatCount(item.level)}</span>`);
  }
  if (toNumber(item.recipeCount) > 0) {
    meta.push(`<span class="craft-meta-pill">${formatCount(item.recipeCount)} ressource${toNumber(item.recipeCount) > 1 ? 's' : ''}</span>`);
  }
  return `
    <div class="craft-selected-head">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        ${item.panoplie ? `<div class="craft-meta-text">${escapeHtml(item.panoplie)}</div>` : ''}
      </div>
      <div class="craft-meta-actions">
        ${renderCraftLinkButton('Objet', item.url)}
        ${renderCraftLinkButton('Panoplie', item.panoplieUrl)}
        <button class="ghost-btn ghost-btn-small" type="button" data-action="clear-craft-selection">Mode manuel</button>
      </div>
    </div>
    ${meta.length ? `<div class="craft-meta-row">${meta.join('')}</div>` : ''}
  `;
}

function renderCraftSearchResults(items) {
  return items.map((item) => `
    <button
      class="craft-search-result"
      type="button"
      data-action="select-craft-item"
      data-key="${escapeHtml(item.key)}"
      data-name="${escapeHtml(item.name)}"
      data-category="${escapeHtml(item.category || '')}"
      data-source="${escapeHtml(item.source || '')}"
      data-level="${escapeHtml(String(item.level ?? 0))}"
      data-url="${escapeHtml(item.url || '')}"
      data-panoplie="${escapeHtml(item.panoplie || '')}"
      data-panoplie-url="${escapeHtml(item.panoplieUrl || '')}"
      data-recipe-count="${escapeHtml(String(item.recipeCount ?? 0))}"
    >
      <div class="craft-search-result-head">
        <span class="craft-search-result-name">${escapeHtml(item.name)}</span>
        ${renderCraftSourcePill(item.source)}
      </div>
      <span class="craft-search-result-meta">${[item.category ? formatCraftCategory(item.category) : '', toNumber(item.level) > 0 ? `Niv. ${formatCount(item.level)}` : '', toNumber(item.recipeCount) > 0 ? `${formatCount(item.recipeCount)} ressources` : ''].filter(Boolean).join(' | ')}</span>
    </button>
  `).join('');
}

function renderCraftForm() {
  const slot = document.getElementById('craft-form-slot');
  if (state.craftForm.mode !== 'create') {
    slot.innerHTML = '';
    return;
  }

  slot.innerHTML = renderCraftEditor();
  const form = slot.querySelector('[data-craft-form]');
  if (form) {
    bindCraftForm(form, null);
  }
}

function renderCraftEditor(craft = null) {
  const selectedItem = getCraftCatalogSelection(craft);
  const catalogState = state.craftCatalogState || { available: false, message: 'Catalogue craft indisponible.' };
  const initialFilter = normalizeCraftSource(selectedItem?.source) || 'all';
  return `
    <form class="craft-editor" data-craft-form>
      <div class="craft-form-grid">
        <label class="form-field craft-search-field">
          <span>Nom de l'item</span>
          <div class="craft-search-inline">
            <input class="form-input" name="name" value="${escapeHtml(craft?.name || '')}" autocomplete="off" placeholder="Rechercher un item" required>
            <div class="craft-source-filters" data-craft-source-filters>
              ${renderCraftSourceFilterButton('all', 'Tous', initialFilter === 'all')}
              ${renderCraftSourceFilterButton('retro', 'Retro', initialFilter === 'retro')}
              ${renderCraftSourceFilterButton('unity', 'Unity', initialFilter === 'unity')}
            </div>
          </div>
          <input type="hidden" name="item_key" value="${escapeHtml(selectedItem?.key || '')}">
          <input type="hidden" name="source_filter" value="${initialFilter}">
          <div class="craft-search-status${catalogState.available ? '' : ' tone-danger'}" data-craft-search-status>${catalogState.available ? '' : escapeHtml(catalogState.message || 'Catalogue craft indisponible.')}</div>
          <div class="craft-search-results hidden" data-craft-search-results></div>
        </label>
        <label class="form-field craft-price-field">
          <span>Prix HDV</span>
          <input class="form-input" name="sell_price" type="number" min="0" step="0.01" value="${craft?.sell_price ?? 0}" required>
        </label>
        <label class="form-field craft-quantity-field">
          <span>Qt</span>
          <input class="form-input" name="target_quantity" type="number" min="1" step="1" value="${craft?.target_quantity ?? 1}" required>
        </label>
      </div>
      <div class="craft-selected-item${selectedItem ? '' : ' hidden'}" data-craft-selected-item>
        ${selectedItem ? renderCraftSelectedItem(selectedItem) : ''}
      </div>
      <div class="craft-form-actions">
        <button class="primary-btn" type="submit">${craft ? 'Enregistrer' : 'Ajouter le craft'}</button>
        <button class="ghost-btn" type="button" data-action="cancel-craft-form">Annuler</button>
      </div>
    </form>
  `;
}

function renderCraftResourceEditor(resource = null) {
  return `
    <form class="craft-editor" data-resource-form>
      <div class="craft-resource-form-grid">
        <label class="form-field">
          <span>Nom de la ressource</span>
          <input class="form-input" name="name" value="${escapeHtml(resource?.name || '')}">
        </label>
        <label class="form-field">
          <span>Prix a l'unite (k/u)</span>
          <input class="form-input" name="unit_price" type="number" min="0" step="0.01" value="${resource?.unit_price ?? 0}" required>
        </label>
        <label class="form-field">
          <span>Quantite / craft</span>
          <input class="form-input" name="quantity" type="number" min="1" step="1" value="${resource?.quantity ?? 1}" required>
        </label>
        <label class="form-field">
          <span>Quantite deja possedee</span>
          <input class="form-input" name="owned_quantity" type="number" min="0" step="1" value="${resource?.owned_quantity ?? 0}">
        </label>
      </div>
      <label class="toggle craft-resource-toggle">
        <input name="included" type="checkbox" ${resource?.included === false ? '' : 'checked'}>
        <span>Inclure cette ressource dans le calcul du cout</span>
      </label>
      <div class="craft-form-actions">
        <button class="primary-btn" type="submit">${resource ? 'Enregistrer la ressource' : 'Ajouter la ressource'}</button>
        <button class="ghost-btn" type="button" data-action="cancel-resource-form">Annuler</button>
      </div>
    </form>
  `;
}

function renderCraftResourceRow(resource, targetQuantity) {
  const purchaseBadge = resource.included ? `${formatCount(resource.purchaseQuantity)} a acheter` : 'Exclu du calcul';
  const totalCostLabel = resource.included ? formatKamas(resource.totalCost) : '0 k';
  return `
    <div class="craft-resource-row${resource.included ? '' : ' is-excluded'}" data-resource-id="${resource.id}">
      <div class="craft-resource-main">
        <div class="craft-resource-name${resource.name ? '' : ' is-empty'}">${resource.name ? escapeHtml(resource.name) : 'Ressource sans nom'}</div>
        <div class="craft-resource-meta">
          <span>${formatCount(resource.quantity)} / craft</span>
          <span>${formatCount(resource.totalQuantity)} requis</span>
        </div>
      </div>
      <div class="craft-resource-inline">
        <label class="craft-inline-field">
          <span>Prix / u</span>
          <input class="craft-inline-input" data-action="set-unit-price" type="number" min="0" step="0.01" value="${resource.unitPrice}">
        </label>
        <label class="craft-inline-field">
          <span>Stock</span>
          <input class="craft-inline-input" data-action="set-owned-quantity" type="number" min="0" step="1" value="${resource.ownedQuantity}">
        </label>
        <button class="ghost-btn ghost-btn-small craft-inline-toggle${resource.included ? '' : ' is-off'}" type="button" data-action="toggle-include" title="${resource.included ? 'Retire cette ressource du calcul.' : 'Reintegre cette ressource dans le calcul.'}">${resource.included ? 'Inclus' : 'Exclus'}</button>
      </div>
      <div class="craft-resource-summary">
        <span class="craft-resource-badge${resource.included ? '' : ' is-off'}">${purchaseBadge}</span>
        <span class="craft-resource-badge craft-resource-badge-cost${resource.included ? '' : ' is-off'}">${totalCostLabel}</span>
      </div>
      <div class="craft-resource-actions">
        ${renderIconButton('delete', 'Supprime cette ressource.', 'danger-btn')}
      </div>
    </div>
  `;
}

function computeCraftTotals(craft) {
  const sellPrice = toNumber(craft.sell_price);
  const targetQuantity = toPositiveInteger(craft.target_quantity, 1);
  const resources = Array.isArray(craft.resources) ? craft.resources.map((resource) => {
    const quantity = toPositiveInteger(resource.quantity, 1);
    const unitPrice = toNumber(resource.unit_price);
    const ownedQuantity = parseNonNegativeIntegerInput(resource.owned_quantity) ?? 0;
    const included = resource.included !== false;
    const totalQuantity = quantity * targetQuantity;
    const purchaseQuantity = Math.max(0, totalQuantity - ownedQuantity);
    const chargedQuantity = included ? purchaseQuantity : 0;
    const totalCost = unitPrice * chargedQuantity;
    return {
      ...resource,
      quantity,
      unitPrice,
      ownedQuantity,
      included,
      totalQuantity,
      purchaseQuantity,
      totalCost,
      lineCost: targetQuantity > 0 ? totalCost / targetQuantity : 0,
    };
  }) : [];

  const totalCost = resources.reduce((sum, resource) => sum + resource.totalCost, 0);
  const unitCost = targetQuantity > 0 ? totalCost / targetQuantity : 0;
  const revenue = sellPrice * targetQuantity;
  return {
    sellPrice,
    targetQuantity,
    resources,
    unitCost,
    totalCost,
    revenue,
    profitUnit: sellPrice - unitCost,
    profitTotal: revenue - totalCost,
  };
}

function openCreateCraftForm() {
  state.craftForm = { mode: 'create', craftId: null };
  renderCrafts();
}

function openEditCraftForm(craftId) {
  state.craftForm = { mode: 'edit', craftId };
  renderCrafts();
}

function closeCraftForm() {
  state.craftForm = { mode: null, craftId: null };
  renderCrafts();
}

function openCreateResourceForm(craftId) {
  state.resourceForm = { craftId, resourceId: null };
  renderCrafts();
}

function openEditResourceForm(craftId, resourceId) {
  state.resourceForm = { craftId, resourceId };
  renderCrafts();
}

function closeResourceForm() {
  state.resourceForm = { craftId: null, resourceId: null };
  renderCrafts();
}

function bindCraftForm(form, craft) {
  const craftId = craft?.id || null;
  const searchInput = form.elements.name;
  const itemKeyInput = form.elements.item_key;
  const sourceFilterInput = form.elements.source_filter;
  const sourceFilterButtons = Array.from(form.querySelectorAll('[data-action="set-craft-source-filter"]'));
  const statusNode = form.querySelector('[data-craft-search-status]');
  const resultsNode = form.querySelector('[data-craft-search-results]');
  const selectedNode = form.querySelector('[data-craft-selected-item]');
  let selectedItem = getCraftCatalogSelection(craft);
  let searchDebounceHandle = null;
  let searchRequestId = 0;

  const getSourceFilter = () => {
    const raw = String(sourceFilterInput?.value || 'all').trim().toLowerCase();
    return ['all', 'retro', 'unity'].includes(raw) ? raw : 'all';
  };

  const syncSourceFilter = () => {
    const current = getSourceFilter();
    sourceFilterInput.value = current;
    sourceFilterButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.sourceFilter === current);
    });
  };

  const setSearchStatus = (message, tone = 'muted') => {
    statusNode.textContent = message || '';
    statusNode.className = message ? `craft-search-status tone-${tone}` : 'craft-search-status';
  };

  const clearResults = () => {
    resultsNode.innerHTML = '';
    resultsNode.classList.add('hidden');
  };

  const syncSelectedItem = () => {
    itemKeyInput.value = selectedItem?.key || '';
    selectedNode.innerHTML = selectedItem ? renderCraftSelectedItem(selectedItem) : '';
    selectedNode.classList.toggle('hidden', !selectedItem);
  };

  const clearSelectedItem = () => {
    selectedItem = null;
    syncSelectedItem();
  };

  const performSearch = async (query) => {
    if (!state.craftCatalogState.available) {
      clearResults();
      setSearchStatus(state.craftCatalogState.message || 'Catalogue craft indisponible.', 'danger');
      return;
    }

    const requestId = ++searchRequestId;
    const sourceFilter = getSourceFilter();
    setSearchStatus('Recherche en cours...', 'muted');
    const response = await window.pywebview.api.search_craft_items(query, 12, sourceFilter);
    if (requestId !== searchRequestId) {
      return;
    }
    if (!response.ok) {
      clearResults();
      setSearchStatus(response.message || 'Recherche impossible.', 'danger');
      return;
    }
    const items = Array.isArray(response.items) ? response.items : [];
    if (!items.length) {
      clearResults();
      setSearchStatus('Aucun item trouve dans la base.', 'muted');
      return;
    }
    resultsNode.innerHTML = renderCraftSearchResults(items);
    resultsNode.classList.remove('hidden');
    setSearchStatus('');
  };

  searchInput.addEventListener('input', () => {
    const query = String(searchInput.value || '').trim();
    if (selectedItem && query !== selectedItem.name) {
      clearSelectedItem();
    }
    if (searchDebounceHandle !== null) {
      window.clearTimeout(searchDebounceHandle);
      searchDebounceHandle = null;
    }
    searchRequestId += 1;
    if (!state.craftCatalogState.available) {
      clearResults();
      setSearchStatus(state.craftCatalogState.message || 'Catalogue craft indisponible.', 'danger');
      return;
    }
    if (query.length < 3) {
      clearResults();
      setSearchStatus('');
      return;
    }
    searchDebounceHandle = window.setTimeout(() => {
      void performSearch(query);
    }, 180);
  });

  sourceFilterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      sourceFilterInput.value = button.dataset.sourceFilter || 'all';
      syncSourceFilter();
      const query = String(searchInput.value || '').trim();
      if (query.length < 3) {
        clearResults();
        setSearchStatus('');
        return;
      }
      void performSearch(query);
    });
  });

  resultsNode.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="select-craft-item"]');
    if (!button) {
      return;
    }
    selectedItem = {
      key: button.dataset.key || '',
      name: button.dataset.name || '',
      category: button.dataset.category || '',
      source: button.dataset.source || '',
      level: Number.parseInt(button.dataset.level || '0', 10) || 0,
      url: button.dataset.url || '',
      panoplie: button.dataset.panoplie || '',
      panoplieUrl: button.dataset.panoplieUrl || '',
      recipeCount: Number.parseInt(button.dataset.recipeCount || '0', 10) || 0,
    };
    searchInput.value = selectedItem.name;
    syncSelectedItem();
    clearResults();
    setSearchStatus('');
  });

  selectedNode.addEventListener('click', async (event) => {
    const clearButton = event.target.closest('[data-action="clear-craft-selection"]');
    if (clearButton) {
      clearSelectedItem();
      setSearchStatus('');
      return;
    }
    const linkButton = event.target.closest('[data-action="open-craft-link"]');
    if (linkButton) {
      await window.pywebview.api.open_link(linkButton.dataset.url);
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = craftPayloadFromForm(form);
    if (!payload) {
      return;
    }
    const response = craftId
      ? await window.pywebview.api.update_craft(craftId, payload.name, payload.sellPrice, payload.targetQuantity, payload.itemKey)
      : await window.pywebview.api.add_craft(payload.name, payload.sellPrice, payload.targetQuantity, payload.itemKey);
    await applyCraftsPayload(response, craftId ? 'Craft modifie' : 'Craft ajoute');
    state.craftForm = { mode: null, craftId: null };
    renderCrafts();
  });

  form.querySelector('[data-action="cancel-craft-form"]').addEventListener('click', () => {
    state.craftForm = { mode: null, craftId: null };
    renderCrafts();
  });

  syncSourceFilter();
  syncSelectedItem();
  if (!state.craftCatalogState.available) {
    setSearchStatus(state.craftCatalogState.message || 'Catalogue craft indisponible.', 'danger');
  } else {
    setSearchStatus('');
  }
}

function bindResourceForm(form, craftId, resourceId) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = craftResourcePayloadFromForm(form);
    if (!payload) {
      return;
    }
    const response = resourceId
      ? await window.pywebview.api.update_craft_resource(craftId, resourceId, payload.name, payload.unitPrice, payload.quantity, payload.ownedQuantity, payload.included)
      : await window.pywebview.api.add_craft_resource(craftId, payload.name, payload.unitPrice, payload.quantity, payload.ownedQuantity, payload.included);
    await applyCraftsPayload(response, resourceId ? 'Ressource modifiee' : 'Ressource ajoutee');
    state.resourceForm = { craftId: null, resourceId: null };
    renderCrafts();
  });

  form.querySelector('[data-action="cancel-resource-form"]').addEventListener('click', () => {
    state.resourceForm = { craftId: null, resourceId: null };
    renderCrafts();
  });
}

function craftPayloadFromForm(form) {
  const name = String(form.elements.name.value || '').trim();
  if (!name) {
    updateStatus('Nom de craft invalide');
    return null;
  }
  const sellPrice = parsePriceInput(form.elements.sell_price.value);
  if (sellPrice === null) {
    return null;
  }
  const targetQuantity = parsePositiveIntegerInput(form.elements.target_quantity.value);
  if (targetQuantity === null) {
    updateStatus('Quantite de craft invalide');
    return null;
  }
  return {
    name,
    itemKey: String(form.elements.item_key?.value || '').trim() || null,
    sellPrice,
    targetQuantity,
  };
}

function craftResourcePayloadFromForm(form) {
  const unitPrice = parsePriceInput(form.elements.unit_price.value);
  if (unitPrice === null) {
    return null;
  }
  const quantity = parsePositiveIntegerInput(form.elements.quantity.value);
  if (quantity === null) {
    updateStatus('Quantite de ressource invalide');
    return null;
  }
  const ownedQuantity = parseNonNegativeIntegerInput(form.elements.owned_quantity.value);
  if (ownedQuantity === null) {
    updateStatus('Quantite possedee invalide');
    return null;
  }
  return {
    name: String(form.elements.name.value || '').trim(),
    unitPrice,
    quantity,
    ownedQuantity,
    included: !!form.elements.included.checked,
  };
}

async function setCraftTargetQuantity(craft, rawValue) {
  const targetQuantity = parsePositiveIntegerInput(rawValue);
  if (targetQuantity === null) {
    updateStatus('Quantite de craft invalide');
    renderCrafts();
    return;
  }
  await applyCraftsPayload(await window.pywebview.api.set_craft_target_quantity(craft.id, targetQuantity), 'Quantite du craft mise a jour');
}

async function setAllCraftsCollapsed(collapsed) {
  await applyCraftsPayload(await window.pywebview.api.set_all_crafts_collapsed(collapsed), collapsed ? 'Tous les crafts sont masques' : 'Tous les crafts sont ouverts');
}

async function deleteCraft(craft) {
  if (!window.confirm(`Supprimer le craft "${craft.name}" ?`)) {
    return;
  }
  await applyCraftsPayload(await window.pywebview.api.delete_craft(craft.id), 'Craft supprime');
}

async function deleteCraftResource(craftId, resource) {
  if (!window.confirm(`Supprimer cette ressource du craft ?`)) {
    return;
  }
  await applyCraftsPayload(await window.pywebview.api.delete_craft_resource(craftId, resource.id), 'Ressource supprimee');
}

async function updateCraftResourceInline(craftId, resource, overrides, successMessage) {
  const quantity = overrides.quantity ?? toPositiveInteger(resource.quantity, 1);
  const unitPrice = parsePriceInput(overrides.unitPrice ?? resource.unit_price ?? resource.unitPrice ?? 0);
  if (unitPrice === null) {
    renderCrafts();
    return;
  }
  const ownedQuantity = parseNonNegativeIntegerInput(overrides.ownedQuantity ?? resource.owned_quantity ?? resource.ownedQuantity ?? 0);
  if (ownedQuantity === null) {
    updateStatus('Quantite possedee invalide');
    renderCrafts();
    return;
  }
  const included = overrides.included ?? (resource.included !== false);
  const response = await window.pywebview.api.update_craft_resource(
    craftId,
    resource.id,
    String(resource.name || ''),
    unitPrice,
    quantity,
    ownedQuantity,
    included,
  );
  await applyCraftsPayload(response, successMessage);
}

async function applyCraftsPayload(payload, successMessage) {
  if (!payload.ok) {
    updateStatus(payload.message || 'Operation impossible');
    return;
  }
  state.dirtyCraftOrder = null;
  state.crafts = payload.crafts;
  renderCrafts();
  updateStatus(successMessage);
}

function parsePriceInput(rawValue) {
  if (rawValue === null) {
    return null;
  }
  const value = Number.parseFloat(String(rawValue).replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) {
    updateStatus('Prix invalide');
    return null;
  }
  return value;
}

function parsePositiveIntegerInput(rawValue) {
  if (rawValue === null) {
    return null;
  }
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isFinite(value) || value < 1) {
    return null;
  }
  return value;
}

function parseNonNegativeIntegerInput(rawValue) {
  if (rawValue === null) {
    return null;
  }
  const value = Number.parseInt(String(rawValue), 10);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function formatKamas(value) {
  const amount = toNumber(value);
  const formatted = amount.toLocaleString('fr-FR', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} k`;
}

function formatSignedKamas(value) {
  const amount = toNumber(value);
  const prefix = amount > 0 ? '+' : '';
  return `${prefix}${formatKamas(amount)}`;
}

function formatCount(value) {
  return Math.max(0, Math.trunc(toNumber(value))).toLocaleString('fr-FR');
}

function bindCraftDrag(card) {
  card.addEventListener('dragstart', (event) => {
    if (!event.target.closest('.drag-handle')) {
      event.preventDefault();
      return;
    }
    card.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', card.dataset.craftId);
  });
  card.addEventListener('dragend', async () => {
    card.classList.remove('dragging');
    await persistCraftOrderIfDirty();
  });
  card.addEventListener('dragover', (event) => {
    event.preventDefault();
    const parent = card.parentElement;
    const dragging = parent?.querySelector('.craft-card.dragging');
    if (!dragging || dragging === card) {
      return;
    }
    const rect = card.getBoundingClientRect();
    const insertBefore = event.clientY < rect.top + rect.height / 2;
    parent.insertBefore(dragging, insertBefore ? card : card.nextSibling);
    state.dirtyCraftOrder = Array.from(parent.querySelectorAll('.craft-card')).map((item) => item.dataset.craftId);
  });
}


async function persistCraftOrderIfDirty() {
  if (!state.dirtyCraftOrder) {
    return;
  }
  const currentOrder = state.crafts.map((craft) => craft.id);
  const dirtyOrder = state.dirtyCraftOrder;
  state.dirtyCraftOrder = null;
  if (dirtyOrder.length === currentOrder.length && dirtyOrder.every((id, index) => id === currentOrder[index])) {
    return;
  }
  await applyCraftsPayload(await window.pywebview.api.save_craft_order(dirtyOrder), 'Ordre des crafts mis a jour');
}

