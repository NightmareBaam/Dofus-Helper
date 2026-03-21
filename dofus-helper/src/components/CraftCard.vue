<script setup lang="ts">
import { computed, ref, watch } from "vue";
import CraftResourceModal from "./crafts/CraftResourceModal.vue";
import type { CraftItem, CraftResource } from "../services/backendClient";

const props = defineProps<{
  craft: CraftItem;
  index: number;
  total: number;
  draggedCraftId?: string | null;
  dragOverCraftId?: string | null;
}>();

const emit = defineEmits<{
  (event: "move-craft", craftId: string, direction: number): void;
  (event: "toggle-craft", craftId: string, collapsed: boolean): void;
  (event: "delete-craft", craftId: string): void;
  (event: "update-craft", craftId: string, patch: Partial<CraftItem>): void;
  (event: "add-resource", craftId: string, payload: { name: string; unitPrice: number; quantity: number; ownedQuantity: number; included: boolean }): void;
  (event: "update-resource", craftId: string, resourceId: string, patch: Partial<CraftResource>): void;
  (event: "delete-resource", craftId: string, resourceId: string): void;
  (event: "open-link", url: string): void;
  (event: "drag-start", craftId: string): void;
  (event: "drag-enter", craftId: string): void;
  (event: "drag-drop", craftId: string): void;
  (event: "drag-end"): void;
}>();

type ComputedResource = CraftResource & {
  quantity: number;
  unitPrice: number;
  ownedQuantity: number;
  included: boolean;
  totalQuantity: number;
  purchaseQuantity: number;
  totalCost: number;
};

const editCraftOpen = ref(false);
const resourceModalOpen = ref(false);
const editName = ref("");
const editSellPrice = ref("0");
const editTargetQuantity = ref("1");

const sourceThemeClass = computed(() => {
  if (props.craft.item_source === "retro") {
    return "is-retro-theme";
  }
  if (props.craft.item_source === "unity") {
    return "is-unity-theme";
  }
  return "";
});

const totals = computed(() => {
  const sellPrice = Number(props.craft.sell_price) || 0;
  const targetQuantity = Math.max(1, Number.parseInt(String(props.craft.target_quantity), 10) || 1);
  const resources: ComputedResource[] = props.craft.resources.map((resource) => {
    const quantity = Math.max(1, Number.parseInt(String(resource.quantity), 10) || 1);
    const unitPrice = Math.max(0, Number(resource.unit_price) || 0);
    const ownedQuantity = Math.max(0, Number.parseInt(String(resource.owned_quantity), 10) || 0);
    const included = resource.included !== false;
    const totalQuantity = quantity * targetQuantity;
    const purchaseQuantity = Math.max(0, totalQuantity - ownedQuantity);
    const totalCost = included ? purchaseQuantity * unitPrice : 0;

    return {
      ...resource,
      quantity,
      unitPrice,
      ownedQuantity,
      included,
      totalQuantity,
      purchaseQuantity,
      totalCost,
    };
  });

  const totalCost = resources.reduce((sum, resource) => sum + resource.totalCost, 0);
  const unitCost = targetQuantity > 0 ? totalCost / targetQuantity : 0;
  const revenue = sellPrice * targetQuantity;

  return {
    sellPrice,
    targetQuantity,
    resources,
    totalCost,
    unitCost,
    revenue,
    profitUnit: sellPrice - unitCost,
    profitTotal: revenue - totalCost,
  };
});

const profitUnitClass = computed(() => totals.value.profitUnit >= 0 ? "is-positive" : "is-negative");
const profitTotalClass = computed(() => totals.value.profitTotal >= 0 ? "is-positive" : "is-negative");

watch(
  () => props.craft,
  (craft) => {
    editName.value = craft.name;
    editSellPrice.value = String(craft.sell_price ?? 0);
    editTargetQuantity.value = String(craft.target_quantity ?? 1);
  },
  { immediate: true },
);

function formatKamas(value: number): string {
  return `${value.toLocaleString("fr-FR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })} k`;
}

function formatSignedKamas(value: number): string {
  return `${value > 0 ? "+" : ""}${formatKamas(value)}`;
}

function formatCount(value: number): string {
  return Math.max(0, Math.trunc(value)).toLocaleString("fr-FR");
}

function formatCategory(category: string | null): string {
  const value = String(category || "").trim();
  if (!value) {
    return "";
  }
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatSource(source: string | null): string {
  const value = String(source || "").trim().toLowerCase();
  if (value === "retro") {
    return "Retro";
  }
  if (value === "unity") {
    return "Unity";
  }
  return value ? "Autre" : "";
}

function parsePrice(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parsePositiveInt(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}

function parseNonNegativeInt(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function toggleEditCraft(): void {
  editCraftOpen.value = !editCraftOpen.value;
  if (editCraftOpen.value) {
    editName.value = props.craft.name;
    editSellPrice.value = String(props.craft.sell_price ?? 0);
    editTargetQuantity.value = String(props.craft.target_quantity ?? 1);
  }
}

function submitEditCraft(): void {
  const name = editName.value.trim();
  const sellPrice = parsePrice(editSellPrice.value);
  const targetQuantity = parsePositiveInt(editTargetQuantity.value);
  if (!name || sellPrice === null || targetQuantity === null) {
    return;
  }

  emit("update-craft", props.craft.id, {
    name,
    sell_price: sellPrice,
    target_quantity: targetQuantity,
  });
  editCraftOpen.value = false;
}

function submitNewResource(payload: { name: string; unitPrice: number; quantity: number; ownedQuantity: number; included: boolean }): void {
  emit("add-resource", props.craft.id, {
    name: payload.name,
    unitPrice: payload.unitPrice,
    quantity: payload.quantity,
    ownedQuantity: payload.ownedQuantity,
    included: payload.included,
  });
  resourceModalOpen.value = false;
}

function updateTargetQuantity(value: string): void {
  const targetQuantity = parsePositiveInt(value);
  if (targetQuantity === null) {
    return;
  }
  emit("update-craft", props.craft.id, { target_quantity: targetQuantity });
}

function updateResourceUnitPrice(resource: ComputedResource, value: string): void {
  const unitPrice = parsePrice(value);
  if (unitPrice === null) {
    return;
  }
  emit("update-resource", props.craft.id, resource.id, { unit_price: unitPrice });
}

function updateResourceOwnedQuantity(resource: ComputedResource, value: string): void {
  const ownedQuantity = parseNonNegativeInt(value);
  if (ownedQuantity === null) {
    return;
  }
  emit("update-resource", props.craft.id, resource.id, { owned_quantity: ownedQuantity });
}

function onHeaderPointerDown(event: PointerEvent): void {
  if (event.button !== 0) {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (target?.closest("button, input, textarea, select, a, label, [data-no-drag]")) {
    return;
  }
  emit("drag-start", props.craft.id);
}

function onPointerEnter(): void {
  emit("drag-enter", props.craft.id);
}

function onPointerUp(): void {
  emit("drag-drop", props.craft.id);
}

function renderIcon(icon: "eye" | "eye-off" | "edit" | "delete" | "add"): string {
  const icons: Record<string, string> = {
    add: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
    "eye-off": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"></path><path d="M10.6 6.3A11.4 11.4 0 0 1 12 6c6.5 0 10 6 10 6a18.7 18.7 0 0 1-4 4.6"></path><path d="M6.7 6.8C3.8 8.7 2 12 2 12s3.5 6 10 6c1.8 0 3.3-.4 4.6-1"></path><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4.2-1 9.1-9.1-3.2-3.2L5 15.8 4 20z"></path><path d="M13.9 6.7l3.2 3.2"></path></svg>',
    delete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14"></path><path d="M9 7V4h6v3"></path><path d="M8 7l1 12h6l1-12"></path><path d="M10 10v6"></path><path d="M14 10v6"></path></svg>',
  };
  return icons[icon];
}
</script>

<template>
  <article
    class="craft-card"
    :class="[
      sourceThemeClass,
      { 'is-collapsed': craft.collapsed, 'is-dragging': draggedCraftId === craft.id, 'is-drag-over': dragOverCraftId === craft.id && draggedCraftId !== craft.id },
    ]"
    @pointerenter="onPointerEnter"
    @pointerup="onPointerUp"
  >
    <div class="craft-head" @pointerdown="onHeaderPointerDown">
      <div class="craft-title">
        <span class="drag-handle" aria-hidden="true" title="Reordonner le craft">:::</span>

        <div class="craft-title-main">
          <div class="craft-title-row">
            <h3>
              <button
                v-if="craft.item_url"
                class="craft-title-link"
                type="button"
                @click="emit('open-link', craft.item_url)"
              >
                {{ craft.name }}
              </button>
              <template v-else>{{ craft.name }}</template>
            </h3>

            <span class="craft-profit-pill" :class="profitUnitClass">
              {{ formatSignedKamas(totals.profitUnit) }} / item
            </span>

            <div v-if="craft.item_category || craft.item_level || craft.item_panoplie || craft.item_source" class="craft-card-meta">
              <span v-if="craft.item_category || craft.item_level" class="craft-meta-pill craft-meta-chip">
                {{ [formatCategory(craft.item_category), craft.item_level > 0 ? `Niv. ${formatCount(craft.item_level)}` : ""].filter(Boolean).join(" ") }}
              </span>
              <button
                v-if="craft.item_panoplie && craft.item_panoplie_url"
                type="button"
                class="craft-meta-pill craft-meta-chip craft-meta-chip-link"
                @click="emit('open-link', craft.item_panoplie_url)"
              >
                {{ craft.item_panoplie }}
              </button>
              <span
                v-if="craft.item_source"
                class="craft-meta-pill craft-source-pill"
                :class="`is-${craft.item_source}`"
              >
                {{ formatSource(craft.item_source) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="craft-actions">
        <button
          type="button"
          class="craft-action-btn"
          data-no-drag
          :title="craft.collapsed ? 'Afficher les informations de ce craft.' : 'Masquer les informations de ce craft.'"
          :aria-label="craft.collapsed ? 'Afficher les informations de ce craft.' : 'Masquer les informations de ce craft.'"
          @click="emit('toggle-craft', craft.id, !craft.collapsed)"
        >
          <span aria-hidden="true" v-html="renderIcon(craft.collapsed ? 'eye-off' : 'eye')" />
        </button>
        <button type="button" class="craft-action-btn" data-no-drag title="Ajouter une ressource" aria-label="Ajouter une ressource" @click="resourceModalOpen = true">
          <span aria-hidden="true" v-html="renderIcon('add')" />
        </button>
        <button
          type="button"
          class="craft-action-btn"
          data-no-drag
          title="Modifier ce craft."
          aria-label="Modifier ce craft."
          @click="toggleEditCraft"
        >
          <span aria-hidden="true" v-html="renderIcon('edit')" />
        </button>
        <button
          type="button"
          class="craft-action-btn danger-btn"
          data-no-drag
          title="Supprimer ce craft."
          aria-label="Supprimer ce craft."
          @click="emit('delete-craft', craft.id)"
        >
          <span aria-hidden="true" v-html="renderIcon('delete')" />
        </button>
      </div>
    </div>

    <form v-if="editCraftOpen" class="craft-editor" @submit.prevent="submitEditCraft">
      <div class="craft-form-grid">
        <label class="form-field craft-search-field">
          <span>Nom de l'item</span>
          <input v-model="editName" class="form-input" placeholder="Nom du craft" required>
        </label>
        <label class="form-field craft-price-field">
          <span>Prix HDV</span>
          <input v-model="editSellPrice" class="form-input" type="number" min="0" step="0.01" required>
        </label>
        <label class="form-field craft-quantity-field">
          <span>Qt</span>
          <input v-model="editTargetQuantity" class="form-input" type="number" min="1" step="1" required>
        </label>
      </div>

      <div class="craft-form-actions">
        <button class="primary-btn" type="submit">Enregistrer</button>
        <button type="button" class="craft-ghost-btn" @click="editCraftOpen = false">Annuler</button>
      </div>
    </form>

    <template v-if="!craft.collapsed">
      <div class="craft-metrics">
        <div class="craft-metric">
          <span>Prix HDV</span>
          <strong>{{ formatKamas(totals.sellPrice) }}</strong>
        </div>
        <div class="craft-metric">
          <span>Cout / item</span>
          <strong>{{ formatKamas(totals.unitCost) }}</strong>
        </div>
        <div class="craft-metric" :class="profitUnitClass">
          <span>Marge / item</span>
          <strong>{{ formatSignedKamas(totals.profitUnit) }}</strong>
        </div>
        <div class="craft-metric">
          <span>Cout total</span>
          <strong>{{ formatKamas(totals.totalCost) }}</strong>
        </div>
        <div class="craft-metric" :class="profitTotalClass">
          <span>Benefice total</span>
          <strong>{{ formatSignedKamas(totals.profitTotal) }}</strong>
        </div>
      </div>

      <div class="craft-target-row">
        <label class="craft-target-label">
          Quantite a craft
          <input
            class="craft-target-input"
            :value="totals.targetQuantity"
            type="number"
            min="1"
            step="1"
            @change="updateTargetQuantity(($event.target as HTMLInputElement).value)"
          >
        </label>
        <div class="craft-target-hint">
          {{ totals.targetQuantity }} item<span v-if="totals.targetQuantity > 1">s</span> -> vente {{ formatKamas(totals.revenue) }}.
        </div>
      </div>

      <div class="craft-section-title">Ressources necessaires</div>

      <div class="craft-resource-list">
        <div v-if="!totals.resources.length" class="link-empty">Aucune ressource pour ce craft.</div>

        <div
          v-for="resource in totals.resources"
          :key="resource.id"
          class="craft-resource-row"
          :class="{ 'is-excluded': !resource.included }"
        >
          <div class="craft-resource-main">
            <div class="craft-resource-name" :class="{ 'is-empty': !resource.name }">
              {{ resource.name || "Ressource sans nom" }}
            </div>
            <div class="craft-resource-meta">
              <span>{{ formatCount(resource.quantity) }} / craft</span>
              <span>{{ formatCount(resource.totalQuantity) }} requis</span>
            </div>
          </div>

          <div class="craft-resource-inline">
            <label class="craft-inline-field">
              <span>Prix / u</span>
              <input
                class="craft-inline-input"
                :value="resource.unitPrice"
                type="number"
                min="0"
                step="0.01"
                @change="updateResourceUnitPrice(resource, ($event.target as HTMLInputElement).value)"
              >
            </label>
            <label class="craft-inline-field">
              <span>Stock</span>
              <input
                class="craft-inline-input"
                :value="resource.ownedQuantity"
                type="number"
                min="0"
                step="1"
                @change="updateResourceOwnedQuantity(resource, ($event.target as HTMLInputElement).value)"
              >
            </label>
            <button
              type="button"
              class="craft-inline-filter-btn"
              :class="{ 'is-active': resource.included }"
              @click="emit('update-resource', craft.id, resource.id, { included: !resource.included })"
            >
              {{ resource.included ? "Inclus" : "Exclus" }}
            </button>
          </div>

          <div class="craft-resource-summary">
            <span class="craft-resource-badge" :class="{ 'is-off': !resource.included }">
              {{ resource.included ? `${formatCount(resource.purchaseQuantity)} a acheter` : "Exclu du calcul" }}
            </span>
            <span class="craft-resource-badge craft-resource-badge-cost" :class="{ 'is-off': !resource.included }">
              {{ resource.included ? formatKamas(resource.totalCost) : "0 k" }}
            </span>
          </div>

          <div class="craft-resource-actions">
            <button
              type="button"
              class="craft-action-btn danger-btn"
              title="Supprimer cette ressource."
              aria-label="Supprimer cette ressource."
              @click="emit('delete-resource', craft.id, resource.id)"
            >
              <span aria-hidden="true" v-html="renderIcon('delete')" />
            </button>
          </div>
        </div>
      </div>
    </template>

    <CraftResourceModal
      :open="resourceModalOpen"
      title="Ajouter une ressource"
      submit-label="Ajouter"
      @close="resourceModalOpen = false"
      @submit="submitNewResource"
    />
  </article>
</template>

<style scoped>
.craft-card {
  padding: 14px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(11, 18, 23, 0.94), rgba(8, 14, 18, 0.96));
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.16);
}

.craft-card.is-dragging {
  opacity: 0.52;
}

.craft-card.is-drag-over {
  border-color: rgba(167, 210, 70, 0.5);
  box-shadow: 0 0 0 2px rgba(167, 210, 70, 0.2);
}

.craft-card.is-retro-theme {
  background: linear-gradient(180deg, rgba(52, 36, 24, 0.96), rgba(28, 20, 14, 0.98));
  border-color: rgba(176, 128, 84, 0.24);
}

.craft-card.is-unity-theme {
  background: linear-gradient(180deg, rgba(22, 34, 32, 0.96), rgba(12, 20, 19, 0.98));
  border-color: rgba(124, 154, 144, 0.2);
}

.craft-card.is-collapsed {
  padding-bottom: 16px;
}

.craft-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  cursor: grab;
}

.craft-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.drag-handle {
  color: var(--text-dim);
  font-weight: 700;
  letter-spacing: 0.12em;
  user-select: none;
  font-size: 12px;
}

.craft-title-main,
.craft-title > div {
  min-width: 0;
}

.craft-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.craft-head h3 {
  margin: 0;
  font-family: "Palatino Linotype", serif;
  font-size: 18px;
}

.craft-title-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.craft-title-link:hover {
  text-decoration: underline;
}

.craft-profit-pill {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  background: rgba(255, 255, 255, 0.05);
}

.craft-profit-pill.is-positive {
  color: var(--ok);
  background: rgba(157, 225, 100, 0.12);
}

.craft-profit-pill.is-negative {
  color: #fda4af;
  background: rgba(226, 121, 121, 0.12);
}

.craft-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.craft-meta-chip,
.craft-source-pill {
  padding: 4px 9px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.82);
  background: transparent;
  color: var(--text);
  font-size: 11px;
}

.craft-meta-chip-link {
  display: inline-flex;
  align-items: center;
  appearance: none;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  line-height: inherit;
}

.craft-meta-chip-link:hover {
  background: rgba(255, 255, 255, 0.08);
}

.craft-actions,
.craft-resource-actions,
.craft-form-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.craft-action-btn {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 9px;
  background: var(--accent-soft);
  color: var(--accent-strong);
  cursor: pointer;
}

.craft-action-btn:hover {
  background: rgba(140, 188, 69, 0.28);
}

.craft-action-btn.danger-btn {
  background: rgba(226, 121, 121, 0.12);
  color: #fecaca;
}

.craft-action-btn.danger-btn:hover {
  background: rgba(226, 121, 121, 0.2);
}

.craft-action-btn :deep(svg) {
  display: block;
  width: 14px;
  height: 14px;
  margin: auto;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.craft-ghost-btn {
  padding: 7px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(8, 14, 18, 0.3);
  color: var(--text);
  cursor: pointer;
}

.craft-ghost-btn-small {
  padding: 7px 11px;
  font-size: 12px;
}

.craft-editor {
  margin-top: 14px;
  padding: 14px;
  border-radius: 16px;
  background: rgba(10, 17, 22, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.craft-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(150px, 180px) 88px;
  gap: 12px;
  align-items: start;
}

.craft-resource-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) repeat(3, minmax(0, 170px));
  gap: 12px;
}

.form-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.form-field span {
  color: var(--text-dim);
  font-size: 12px;
}

.form-input {
  width: 100%;
  padding: 11px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(8, 14, 18, 0.44);
  color: var(--text);
}

.craft-resource-toggle {
  margin-top: 14px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-dim);
}

.craft-form-actions {
  margin-top: 14px;
}

.craft-metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.craft-metric {
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.craft-metric span {
  display: block;
  color: var(--text-dim);
  font-size: 11px;
}

.craft-metric strong {
  display: block;
  margin-top: 4px;
  font-size: 15px;
}

.craft-metric.is-positive strong {
  color: var(--ok);
}

.craft-metric.is-negative strong {
  color: #fda4af;
}

.craft-target-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.craft-target-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-dim);
  font-size: 12px;
}

.craft-target-input {
  width: 76px;
  padding: 6px 8px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(8, 14, 18, 0.44);
  color: var(--text);
}

.craft-target-hint {
  color: var(--text-dim);
  font-size: 12px;
}

.craft-section-title {
  margin-top: 14px;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 700;
}

.craft-resource-list {
  display: grid;
  gap: 8px;
}

.craft-resource-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.craft-resource-row.is-excluded {
  opacity: 0.7;
}

.craft-resource-main {
  min-width: 0;
}

.craft-resource-name {
  font-weight: 700;
  font-size: 14px;
}

.craft-resource-name.is-empty {
  color: var(--text-dim);
}

.craft-resource-meta {
  margin-top: 4px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.craft-resource-meta span {
  color: var(--text-dim);
  font-size: 11px;
}

.craft-resource-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.craft-inline-field {
  display: grid;
  gap: 3px;
  color: var(--text-dim);
  font-size: 10px;
}

.craft-inline-input {
  width: 80px;
  padding: 6px 8px;
  border-radius: 9px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(8, 14, 18, 0.44);
  color: var(--text);
  font-size: 12px;
}

.craft-inline-filter-btn {
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

.craft-inline-filter-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}

.craft-inline-filter-btn.is-active {
  background: var(--accent-soft);
  border-color: rgba(140, 188, 69, 0.24);
  color: var(--accent-strong);
}

.craft-resource-summary {
  min-width: 190px;
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
}

.craft-resource-badge {
  display: inline-flex;
  align-items: center;
  padding: 5px 8px;
  border-radius: 999px;
  background: rgba(140, 188, 69, 0.08);
  border: 1px solid rgba(140, 188, 69, 0.12);
  color: var(--accent-strong);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.craft-resource-badge-cost {
  background: rgba(255, 209, 102, 0.08);
  border-color: rgba(255, 209, 102, 0.14);
  color: #ffd166;
}

.craft-resource-badge.is-off {
  background: rgba(255, 255, 255, 0.03);
  border-color: rgba(255, 255, 255, 0.05);
  color: var(--text-dim);
}

.link-empty {
  padding: 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed rgba(255, 255, 255, 0.08);
  color: var(--text-dim);
  text-align: center;
}

@media (max-width: 1120px) {
  .craft-head,
  .craft-target-row,
  .craft-resource-row {
    grid-template-columns: 1fr;
  }

  .craft-head,
  .craft-target-row {
    display: grid;
  }

  .craft-resource-summary {
    min-width: 0;
    justify-content: flex-start;
  }
}

@media (max-width: 920px) {
  .craft-form-grid,
  .craft-resource-form-grid,
  .craft-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
