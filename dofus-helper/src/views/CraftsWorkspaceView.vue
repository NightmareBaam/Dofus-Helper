<script setup lang="ts">
import { openUrl } from "@tauri-apps/plugin-opener";
import { onMounted, onUnmounted, ref, watch } from "vue";
import CraftCard from "../components/CraftCard.vue";
import CraftsToolbar from "../components/crafts/CraftsToolbar.vue";
import ToastStack from "../components/ui/ToastStack.vue";
import { backendClient, type CatalogSearchItem, type CraftCatalogState, type CraftItem, type CraftResource, type CraftsPayload } from "../services/backendClient";

const crafts = ref<CraftItem[]>([]);
const catalogState = ref<CraftCatalogState>({ available: false, message: "Catalogue craft indisponible." });
const loading = ref(true);
const busy = ref(false);
const errorMessage = ref("");
const statusMessage = ref("");
const searchQuery = ref("");
const searchResults = ref<CatalogSearchItem[]>([]);
const searchBusy = ref(false);
const searchSource = ref("all");
const selectedItem = ref<CatalogSearchItem | null>(null);
const newCraftSellPrice = ref("0");
const newCraftTargetQuantity = ref("1");
const showCreateForm = ref(false);
const draggedCraftId = ref<string | null>(null);
const dragOverCraftId = ref<string | null>(null);
let searchHandle: number | null = null;
let lastSearchId = 0;

async function loadCrafts(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    const payload = await backendClient.listCrafts();
    crafts.value = payload.crafts;
    catalogState.value = payload.craftCatalogState;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Impossible de charger les crafts.";
  } finally {
    loading.value = false;
  }
}

async function runCraftAction(action: () => Promise<CraftsPayload>, successMessage: string): Promise<void> {
  busy.value = true;
  errorMessage.value = "";
  statusMessage.value = "";
  try {
    const payload = await action();
    crafts.value = payload.crafts;
    catalogState.value = payload.craftCatalogState;
    if (!payload.ok) {
      errorMessage.value = payload.message ?? "Operation impossible.";
      return;
    }
    statusMessage.value = successMessage;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Operation impossible.";
  } finally {
    busy.value = false;
  }
}

function normalizeSourceFilter(value: string): string {
  return ["all", "retro", "unity"].includes(value) ? value : "all";
}

function queueSearch(): void {
  if (searchHandle !== null) {
    window.clearTimeout(searchHandle);
  }
  searchResults.value = [];

  const query = searchQuery.value.trim();
  if (!catalogState.value.available || query.length < 3) {
    searchBusy.value = false;
    return;
  }

  const requestId = ++lastSearchId;
  searchBusy.value = true;
  searchHandle = window.setTimeout(async () => {
    try {
      const payload = await backendClient.searchCraftItems(query, 12, normalizeSourceFilter(searchSource.value));
      if (requestId !== lastSearchId) {
        return;
      }
      if (!payload.ok) {
        errorMessage.value = payload.message ?? "Recherche impossible.";
        searchResults.value = [];
        return;
      }
      searchResults.value = payload.items;
    } catch (error) {
      if (requestId === lastSearchId) {
        errorMessage.value = error instanceof Error ? error.message : "Recherche impossible.";
      }
    } finally {
      if (requestId === lastSearchId) {
        searchBusy.value = false;
      }
    }
  }, 180);
}

watch(searchQuery, (value) => {
  if (selectedItem.value && value.trim() !== selectedItem.value.name) {
    selectedItem.value = null;
  }
  queueSearch();
});

watch(searchSource, () => {
  queueSearch();
});

function clearSelection(): void {
  selectedItem.value = null;
}

function selectItem(item: CatalogSearchItem): void {
  selectedItem.value = item;
  searchQuery.value = item.name;
  searchResults.value = [];
}

function parsePrice(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parsePositiveInt(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}

async function addCraft(): Promise<void> {
  const sellPrice = parsePrice(newCraftSellPrice.value);
  const targetQuantity = parsePositiveInt(newCraftTargetQuantity.value);
  const name = searchQuery.value.trim();
  if (sellPrice === null || targetQuantity === null || !name) {
    errorMessage.value = "Formulaire de craft invalide.";
    return;
  }
  await runCraftAction(() => backendClient.addCraft(name, sellPrice, targetQuantity, selectedItem.value?.key ?? null), "Craft ajoute.");
  searchQuery.value = "";
  searchResults.value = [];
  selectedItem.value = null;
  newCraftSellPrice.value = "0";
  newCraftTargetQuantity.value = "1";
  showCreateForm.value = false;
}

function toggleCreateForm(): void {
  showCreateForm.value = !showCreateForm.value;
  if (showCreateForm.value) {
    return;
  }
  searchQuery.value = "";
  searchResults.value = [];
  selectedItem.value = null;
  newCraftSellPrice.value = "0";
  newCraftTargetQuantity.value = "1";
}

async function updateCraft(craftId: string, patch: Partial<CraftItem>): Promise<void> {
  const craft = crafts.value.find((item) => item.id === craftId);
  if (!craft) {
    return;
  }
  const sellPrice = Math.max(0, Number(patch.sell_price ?? craft.sell_price) || 0);
  const targetQuantity = Math.max(1, Number.parseInt(String(patch.target_quantity ?? craft.target_quantity), 10) || 1);
  const name = String(patch.name ?? craft.name).trim();
  await runCraftAction(() => backendClient.updateCraft(craftId, name, sellPrice, targetQuantity, craft.item_key), "Craft mis a jour.");
}

async function moveCraft(craftId: string, direction: number): Promise<void> {
  const index = crafts.value.findIndex((craft) => craft.id === craftId);
  if (index === -1) {
    return;
  }
  const target = Math.max(0, Math.min(crafts.value.length - 1, index + direction));
  if (target === index) {
    return;
  }
  const next = [...crafts.value];
  const [craft] = next.splice(index, 1);
  next.splice(target, 0, craft);
  await runCraftAction(() => backendClient.saveCraftOrder(next.map((item) => item.id)), "Ordre des crafts mis a jour.");
}

function onDragStart(craftId: string): void {
  draggedCraftId.value = craftId;
  dragOverCraftId.value = craftId;
  document.body.style.userSelect = "none";
  document.body.style.cursor = "grabbing";
}

function onDragEnter(craftId: string): void {
  if (draggedCraftId.value === null || draggedCraftId.value === craftId) {
    return;
  }
  dragOverCraftId.value = craftId;
}

function onDragEnd(): void {
  draggedCraftId.value = null;
  dragOverCraftId.value = null;
  document.body.style.userSelect = "";
  document.body.style.cursor = "";
}

async function onDrop(targetCraftId: string): Promise<void> {
  if (draggedCraftId.value === null || draggedCraftId.value === targetCraftId) {
    onDragEnd();
    return;
  }
  const fromIndex = crafts.value.findIndex((craft) => craft.id === draggedCraftId.value);
  const toIndex = crafts.value.findIndex((craft) => craft.id === targetCraftId);
  onDragEnd();
  if (fromIndex === -1 || toIndex === -1) {
    return;
  }

  const next = [...crafts.value];
  const [craft] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, craft);
  await runCraftAction(() => backendClient.saveCraftOrder(next.map((item) => item.id)), "Ordre des crafts mis a jour.");
}

function onGlobalPointerRelease(): void {
  const target = dragOverCraftId.value;
  if (draggedCraftId.value === null) {
    return;
  }
  if (target !== null && target !== draggedCraftId.value) {
    void onDrop(target);
    return;
  }
  onDragEnd();
}

async function toggleCraft(craftId: string, collapsed: boolean): Promise<void> {
  await runCraftAction(() => backendClient.setCraftCollapsed(craftId, collapsed), collapsed ? "Craft masque." : "Craft affiche.");
}

async function deleteCraft(craftId: string): Promise<void> {
  await runCraftAction(() => backendClient.deleteCraft(craftId), "Craft supprime.");
}

async function addResource(craftId: string, payload: { name: string; unitPrice: number; quantity: number; ownedQuantity: number; included: boolean }): Promise<void> {
  await runCraftAction(() => backendClient.addCraftResource(craftId, payload.name, payload.unitPrice, payload.quantity, payload.ownedQuantity, payload.included), "Ressource ajoutee.");
}

async function updateResource(craftId: string, resourceId: string, patch: Partial<CraftResource>): Promise<void> {
  const craft = crafts.value.find((item) => item.id === craftId);
  const resource = craft?.resources.find((item) => item.id === resourceId);
  if (!craft || !resource) {
    return;
  }
  await runCraftAction(
    () => backendClient.updateCraftResource(
      craftId,
      resourceId,
      String(patch.name ?? resource.name),
      Math.max(0, Number(patch.unit_price ?? resource.unit_price) || 0),
      Math.max(1, Number.parseInt(String(patch.quantity ?? resource.quantity), 10) || 1),
      Math.max(0, Number.parseInt(String(patch.owned_quantity ?? resource.owned_quantity), 10) || 0),
      Boolean(patch.included ?? resource.included),
    ),
    "Ressource mise a jour.",
  );
}

async function deleteResource(craftId: string, resourceId: string): Promise<void> {
  await runCraftAction(() => backendClient.deleteCraftResource(craftId, resourceId), "Ressource supprimee.");
}

async function setAllCraftsCollapsed(collapsed: boolean): Promise<void> {
  await runCraftAction(() => backendClient.setAllCraftsCollapsed(collapsed), collapsed ? "Tous les crafts sont masques." : "Tous les crafts sont affiches.");
}

async function openLink(url: string): Promise<void> {
  try {
    await openUrl(url);
    statusMessage.value = "Lien ouvert.";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Impossible d'ouvrir le lien.";
  }
}

onMounted(() => {
  window.addEventListener("pointerup", onGlobalPointerRelease);
  window.addEventListener("pointercancel", onGlobalPointerRelease);
  window.addEventListener("blur", onGlobalPointerRelease);
  void loadCrafts();
});

onUnmounted(() => {
  window.removeEventListener("pointerup", onGlobalPointerRelease);
  window.removeEventListener("pointercancel", onGlobalPointerRelease);
  window.removeEventListener("blur", onGlobalPointerRelease);
  onDragEnd();
});
</script>

<template>
  <div class="space-y-4">
    <CraftsToolbar
      :busy="busy"
      :catalog-state="catalogState"
      :search-query="searchQuery"
      :search-results="searchResults"
      :search-busy="searchBusy"
      :search-source="searchSource"
      :selected-item="selectedItem"
      :new-craft-sell-price="newCraftSellPrice"
      :new-craft-target-quantity="newCraftTargetQuantity"
      :show-create-form="showCreateForm"
      @update:search-query="searchQuery = $event"
      @update:search-source="searchSource = $event"
      @update:new-craft-sell-price="newCraftSellPrice = $event"
      @update:new-craft-target-quantity="newCraftTargetQuantity = $event"
      @select-item="selectItem"
      @clear-selection="clearSelection"
      @add-craft="addCraft"
      @toggle-create-form="toggleCreateForm"
      @set-all-crafts-collapsed="setAllCraftsCollapsed"
      @open-link="openLink"
    />

    <section class="space-y-3">
      <div v-if="loading" class="rounded-[22px] border border-white/6 bg-[#1b2f3a] px-6 py-10 text-center text-sm text-stone-300/75">
        Chargement...
      </div>
      <div v-else-if="!crafts.length" class="rounded-[22px] border border-dashed border-white/8 bg-[#1b2f3a] px-6 py-12 text-center text-sm text-stone-300/75">
        Aucun craft suivi pour le moment.
      </div>
      <template v-else>
        <CraftCard
          v-for="(craft, index) in crafts"
          :key="craft.id"
          :craft="craft"
          :index="index"
          :total="crafts.length"
          :dragged-craft-id="draggedCraftId"
          :drag-over-craft-id="dragOverCraftId"
          @move-craft="moveCraft"
          @drag-start="onDragStart"
          @drag-enter="onDragEnter"
          @drag-drop="onDrop"
          @drag-end="onDragEnd"
          @toggle-craft="toggleCraft"
          @delete-craft="deleteCraft"
          @update-craft="updateCraft"
          @add-resource="addResource"
          @update-resource="updateResource"
          @delete-resource="deleteResource"
          @open-link="openLink"
        />
      </template>
    </section>

    <ToastStack :status-message="statusMessage" :error-message="errorMessage" />
  </div>
</template>
