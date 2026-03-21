<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { CatalogSearchItem, CraftCatalogState } from "../../services/backendClient";

const props = defineProps<{
  busy: boolean;
  catalogState: CraftCatalogState;
  searchQuery: string;
  searchResults: CatalogSearchItem[];
  searchBusy: boolean;
  searchSource: string;
  selectedItem: CatalogSearchItem | null;
  newCraftSellPrice: string;
  newCraftTargetQuantity: string;
  showCreateForm: boolean;
}>();

const emit = defineEmits<{
  (event: "update:search-query", value: string): void;
  (event: "update:search-source", value: string): void;
  (event: "update:new-craft-sell-price", value: string): void;
  (event: "update:new-craft-target-quantity", value: string): void;
  (event: "select-item", item: CatalogSearchItem): void;
  (event: "clear-selection"): void;
  (event: "add-craft"): void;
  (event: "set-all-crafts-collapsed", collapsed: boolean): void;
  (event: "open-link", url: string): void;
  (event: "toggle-create-form"): void;
}>();

const sourceFilters = [
  { value: "all", label: "Tous" },
  { value: "retro", label: "Retro" },
  { value: "unity", label: "Unity" },
] as const;

const searchStatus = computed(() => {
  if (!props.catalogState.available) {
    return {
      text: props.catalogState.message || "Catalogue craft indisponible.",
      tone: "danger" as const,
    };
  }

  const query = props.searchQuery.trim();
  if (props.searchBusy) {
    return { text: "Recherche en cours...", tone: "muted" as const };
  }

  if (query.length > 0 && query.length < 3) {
    return { text: "Saisissez au moins 3 caracteres.", tone: "muted" as const };
  }

  if (query.length >= 3 && !props.searchResults.length && !props.selectedItem) {
    return { text: "Aucun item trouve dans la base.", tone: "muted" as const };
  }

  return { text: "", tone: "muted" as const };
});

const showSearchSelect = computed(() => props.catalogState.available
  && !props.selectedItem
  && props.searchQuery.trim().length >= 3
  && props.searchResults.length > 0);

const addDisabled = computed(() => props.busy || !props.searchQuery.trim().length);
const searchPickerOpen = ref(false);
const searchPickerRef = ref<HTMLElement | null>(null);

function formatCategory(category: string): string {
  const value = category.trim();
  if (!value) {
    return "";
  }
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatSourceLabel(item: CatalogSearchItem): string {
  const sourceLabel = item.sourceLabel?.trim();
  if (sourceLabel) {
    return sourceLabel;
  }
  const source = item.source.trim().toLowerCase();
  if (source === "retro") {
    return "Retro";
  }
  if (source === "unity") {
    return "Unity";
  }
  return source ? "Autre" : "";
}

function formatOptionMeta(item: CatalogSearchItem): string {
  return [
    item.category ? formatCategory(item.category) : "",
    item.level > 0 ? `Niv. ${item.level}` : "",
    item.recipeCount > 0 ? `${item.recipeCount} ressource${item.recipeCount > 1 ? "s" : ""}` : "",
  ].filter(Boolean).join(" | ");
}

function selectSearchResult(item: CatalogSearchItem): void {
  emit("select-item", item);
  searchPickerOpen.value = false;
}

function toggleSearchPicker(): void {
  searchPickerOpen.value = !searchPickerOpen.value;
}

function handlePointerDown(event: PointerEvent): void {
  if (searchPickerRef.value?.contains(event.target as Node)) {
    return;
  }
  searchPickerOpen.value = false;
}

watch(showSearchSelect, (visible) => {
  searchPickerOpen.value = visible;
});

watch(() => props.selectedItem, (selectedItem) => {
  if (selectedItem) {
    searchPickerOpen.value = false;
  }
});

onMounted(() => {
  window.addEventListener("pointerdown", handlePointerDown);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", handlePointerDown);
});
</script>

<template>
  <div class="crafts-toolbar">
    <div class="craft-toolbar-head">
      <div v-if="!catalogState.available" class="craft-catalog-warning">
        {{ catalogState.message }}
      </div>

      <div class="craft-toolbar-actions">
        <button
          type="button"
          class="craft-toolbar-btn craft-toolbar-btn-primary"
          :disabled="busy"
          @click="emit('toggle-create-form')"
        >
          {{ showCreateForm ? "Fermer" : "Nouveau Craft" }}
        </button>
        <button
          type="button"
          class="craft-toolbar-btn"
          :disabled="busy"
          @click="emit('set-all-crafts-collapsed', false)"
        >
          Tout ouvrir
        </button>
        <button
          type="button"
          class="craft-toolbar-btn"
          :disabled="busy"
          @click="emit('set-all-crafts-collapsed', true)"
        >
          Tout masquer
        </button>
      </div>
    </div>

    <form v-if="showCreateForm" class="craft-editor" @submit.prevent="emit('add-craft')">
      <div class="craft-create-grid">
        <label class="form-field craft-search-field">
          <span>Nom de l'item</span>
          <div class="craft-search-row">
            <input
              :value="searchQuery"
              class="craft-search-input"
              autocomplete="off"
              placeholder="Rechercher un item"
              @input="emit('update:search-query', ($event.target as HTMLInputElement).value)"
            >
          </div>
          <div class="craft-search-status" :class="{ 'tone-danger': searchStatus.tone === 'danger' }">
            {{ searchStatus.text }}
          </div>
          <div v-if="showSearchSelect" ref="searchPickerRef" class="craft-search-picker">
            <button type="button" class="craft-search-picker-trigger" @click="toggleSearchPicker">
              <span>{{ searchPickerOpen ? "Fermer la selection" : "Selectionner un item" }}</span>
              <span class="craft-search-picker-icon" :class="{ 'is-open': searchPickerOpen }" aria-hidden="true"></span>
            </button>

            <div v-if="searchPickerOpen" class="craft-search-results">
              <button
                v-for="item in searchResults"
                :key="item.key"
                type="button"
                class="craft-search-result"
                @click="selectSearchResult(item)"
              >
                <div class="craft-search-result-head">
                  <span class="craft-search-result-name">{{ item.name }}</span>
                  <span
                    v-if="formatSourceLabel(item)"
                    class="craft-meta-pill craft-source-pill"
                    :class="`is-${item.source || 'unknown'}`"
                  >
                    {{ formatSourceLabel(item) }}
                  </span>
                </div>
                <span v-if="formatOptionMeta(item)" class="craft-search-result-meta">{{ formatOptionMeta(item) }}</span>
              </button>
            </div>
          </div>
        </label>

        <div class="craft-source-filters">
          <button
            v-for="filter in sourceFilters"
            :key="filter.value"
            type="button"
            class="craft-source-filter-btn"
            :class="{ 'is-active': searchSource === filter.value }"
            @click="emit('update:search-source', filter.value)"
          >
            {{ filter.label }}
          </button>
        </div>

        <label class="form-field craft-price-field">
          <span>Prix HDV</span>
          <input
            :value="newCraftSellPrice"
            class="craft-field-input"
            min="0"
            step="0.01"
            type="number"
            @input="emit('update:new-craft-sell-price', ($event.target as HTMLInputElement).value)"
          >
        </label>

        <label class="form-field craft-quantity-field">
          <span>Qt</span>
          <input
            :value="newCraftTargetQuantity"
            class="craft-field-input craft-quantity-input"
            min="1"
            step="1"
            type="number"
            @input="emit('update:new-craft-target-quantity', ($event.target as HTMLInputElement).value)"
          >
        </label>

        <div class="craft-form-actions">
          <button
            class="rounded-2xl primary-btn px-4 py-3 text-sm font-semibold text-[#182311] disabled:opacity-50"
            :disabled="addDisabled"
            type="submit"
          >
            Ajouter le craft
          </button>
        </div>
      </div>

      <div v-if="selectedItem" class="craft-selected-item">
        <div class="craft-selected-head">
          <div>
            <strong>{{ selectedItem.name }}</strong>
            <div v-if="selectedItem.panoplie" class="craft-meta-text">{{ selectedItem.panoplie }}</div>
          </div>
          <div class="craft-meta-actions">
            <button
              v-if="selectedItem.url"
              type="button"
              class="craft-meta-action-btn"
              @click="emit('open-link', selectedItem.url)"
            >
              Objet
            </button>
            <button
              v-if="selectedItem.panoplieUrl"
              type="button"
              class="craft-meta-action-btn"
              @click="emit('open-link', selectedItem.panoplieUrl)"
            >
              Panoplie
            </button>
            <button type="button" class="craft-meta-action-btn" @click="emit('clear-selection')">
              Mode manuel
            </button>
          </div>
        </div>

        <div class="craft-meta-row">
          <span v-if="formatSourceLabel(selectedItem)" class="craft-meta-pill craft-source-pill" :class="`is-${selectedItem.source || 'unknown'}`">
            {{ formatSourceLabel(selectedItem) }}
          </span>
          <span v-if="selectedItem.category" class="craft-meta-pill">{{ formatCategory(selectedItem.category) }}</span>
          <span v-if="selectedItem.level > 0" class="craft-meta-pill">Niv. {{ selectedItem.level }}</span>
          <span v-if="selectedItem.recipeCount > 0" class="craft-meta-pill">
            {{ selectedItem.recipeCount }} ressource{{ selectedItem.recipeCount > 1 ? "s" : "" }}
          </span>
        </div>
      </div>
    </form>
  </div>
</template>

<style scoped>
.crafts-toolbar {
  display: grid;
  gap: 16px;
}

.craft-toolbar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.craft-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
}

.craft-toolbar-btn {
  padding: 10px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #213742;
  color: #d7dfdc;
  font-size: 13px;
  cursor: pointer;
}

.craft-toolbar-btn-primary {
  border: 0;
  color: #14202a;
  font-weight: 800;
  background: linear-gradient(135deg, #b6d867, var(--accent));
  box-shadow: 0 10px 20px rgba(140, 188, 69, 0.16);
}

.craft-toolbar-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.craft-catalog-warning {
  padding: 10px 14px;
  border-radius: 14px;
  border: 1px solid rgba(252, 165, 165, 0.18);
  background: rgba(244, 63, 94, 0.08);
  color: #fecdd3;
  font-size: 13px;
}

.craft-editor {
  padding: 18px;
  border-radius: 20px;
  background: rgba(10, 17, 22, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.craft-create-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 228px 108px;
  grid-template-areas:
    "search filters price quantity"
    "actions . . .";
  gap: 14px;
  align-items: start;
}

.craft-source-filter-btn {
  padding: 9px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(8, 14, 18, 0.44);
  color: var(--text-dim);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: 120ms ease;
  white-space: nowrap;
}

.craft-source-filter-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

.craft-source-filter-btn.is-active {
  background: var(--accent-soft);
  border-color: rgba(140, 188, 69, 0.24);
  color: var(--accent-strong);
}

.form-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.form-field > span {
  color: var(--text-dim);
  font-size: 12px;
}

.craft-search-field {
  grid-area: search;
}

.craft-price-field {
  grid-area: price;
}

.craft-quantity-field {
  grid-area: quantity;
}

.craft-search-row {
  display: flex;
  align-items: center;
  min-width: 0;
}

.craft-search-input {
  width: 100%;
  min-width: 0;
  padding: 14px 18px;
  border-radius: 20px;
  border: 1px solid rgba(140, 188, 69, 0.45);
  background: #16262f;
  color: #fff;
  font-size: 15px;
  outline: none;
}

.craft-search-input::placeholder {
  color: #787d84;
}

.craft-search-input:focus {
  border-color: rgba(167, 210, 70, 0.6);
}

.craft-source-filters {
  grid-area: filters;
  display: inline-flex;
  align-items: flex-end;
  gap: 6px;
  padding-top: 24px;
  flex-wrap: nowrap;
}

.craft-field-input {
  width: 100%;
  min-height: 56px;
  padding: 11px 16px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(8, 14, 18, 0.44);
  color: var(--text);
  font-size: 17px;
  font-weight: 600;
}

.craft-quantity-input {
  padding-left: 12px;
  padding-right: 12px;
  text-align: center;
}

.craft-search-status {
  font-size: 11px;
  color: var(--text-dim);
}

.craft-search-status:empty {
  display: none;
}

.craft-search-status:not(:empty) {
  margin-top: 6px;
}

.craft-search-status.tone-danger {
  color: #fca5a5;
}

.craft-search-picker {
  margin-top: 8px;
  position: relative;
}

.craft-search-picker-trigger {
  width: 100%;
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(8, 14, 18, 0.72);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.craft-search-picker-icon {
  width: 11px;
  height: 11px;
  border-right: 2px solid rgba(238, 244, 235, 0.78);
  border-bottom: 2px solid rgba(238, 244, 235, 0.78);
  transform: rotate(45deg);
  transition: transform 120ms ease;
}

.craft-search-picker-icon.is-open {
  transform: rotate(225deg);
}

.craft-search-results {
  margin-top: 8px;
  padding: 8px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(8, 14, 18, 0.72);
  display: grid;
  gap: 6px;
  max-height: 260px;
  overflow: auto;
}

.craft-search-result {
  width: 100%;
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.craft-search-result:hover {
  background: rgba(140, 188, 69, 0.12);
  border-color: rgba(140, 188, 69, 0.28);
}

.craft-search-result-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.craft-search-result-name {
  font-weight: 700;
}

.craft-search-result-meta {
  color: var(--text-dim);
  font-size: 12px;
}

.craft-selected-item {
  margin-top: 10px;
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid rgba(140, 188, 69, 0.18);
  background: rgba(140, 188, 69, 0.08);
}

.craft-selected-head,
.craft-meta-row,
.craft-meta-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.craft-selected-head {
  justify-content: space-between;
  align-items: flex-start;
}

.craft-meta-text {
  color: var(--text-dim);
  font-size: 12px;
}

.craft-meta-action-btn {
  padding: 7px 11px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(8, 14, 18, 0.32);
  color: var(--text);
  cursor: pointer;
  font-size: 12px;
}

.craft-meta-action-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.craft-meta-pill {
  display: inline-flex;
  align-items: center;
  padding: 5px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 700;
}

.craft-source-pill {
  border: 1px solid transparent;
}

.craft-source-pill.is-retro {
  background: rgba(157, 225, 100, 0.1);
  border-color: rgba(157, 225, 100, 0.18);
  color: var(--retro);
}

.craft-source-pill.is-unity {
  background: rgba(110, 181, 230, 0.12);
  border-color: rgba(110, 181, 230, 0.18);
  color: var(--unity);
}

.craft-source-pill.is-unknown {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.08);
  color: var(--text-dim);
}

.craft-form-actions {
  grid-area: actions;
  display: flex;
  justify-content: flex-start;
  margin-top: 4px;
}

@media (max-width: 1100px) {
  .craft-create-grid {
    grid-template-columns: minmax(0, 1fr) 200px 96px;
    grid-template-areas:
      "search price quantity"
      "filters filters filters"
      "actions actions actions";
  }
}

@media (max-width: 760px) {
  .craft-create-grid {
    grid-template-columns: 1fr;
    grid-template-areas:
      "search"
      "filters"
      "price"
      "quantity"
      "actions";
  }

  .craft-source-filters {
    padding-top: 0;
    flex-wrap: wrap;
  }
}
</style>
