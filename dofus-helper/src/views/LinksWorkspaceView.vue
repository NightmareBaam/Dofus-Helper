<script setup lang="ts">
import { openUrl } from "@tauri-apps/plugin-opener";
import { onMounted, onUnmounted, ref } from "vue";
import LinkGroupCard from "../components/LinkGroupCard.vue";
import ToastStack from "../components/ui/ToastStack.vue";
import { backendClient, type LinkGroup, type LinksPayload } from "../services/backendClient";

const links = ref<LinkGroup[]>([]);
const loading = ref(true);
const busy = ref(false);
const errorMessage = ref("");
const statusMessage = ref("");
const groupNameDraft = ref("");
const draggedGroupId = ref<string | null>(null);
const dragOverGroupId = ref<string | null>(null);

function reorderArray<T>(items: T[], index: number, direction: number): T[] {
  const target = Math.max(0, Math.min(items.length - 1, index + direction));
  if (target === index) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

function reorderIds(items: { id: string }[], draggedId: string, targetId: string): string[] {
  const fromIndex = items.findIndex((item) => item.id === draggedId);
  const toIndex = items.findIndex((item) => item.id === targetId);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
    return items.map((item) => item.id);
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next.map((item) => item.id);
}

async function loadWorkspace(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";

  try {
    const linksPayload = await backendClient.listLinks();
    links.value = linksPayload.links;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Impossible de charger les liens.";
  } finally {
    loading.value = false;
  }
}

async function runLinksAction(action: () => Promise<LinksPayload>, successMessage: string): Promise<void> {
  busy.value = true;
  errorMessage.value = "";
  statusMessage.value = "";

  try {
    const payload = await action();
    links.value = payload.links;
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

async function addGroup(): Promise<void> {
  const name = groupNameDraft.value.trim();
  if (!name) {
    return;
  }
  await runLinksAction(() => backendClient.addLinkGroup(name), "Dossier ajoute.");
  groupNameDraft.value = "";
}

async function renameGroup(groupId: string, name: string): Promise<void> {
  await runLinksAction(() => backendClient.renameLinkGroup(groupId, name), "Dossier renomme.");
}

async function deleteGroup(groupId: string): Promise<void> {
  await runLinksAction(() => backendClient.deleteLinkGroup(groupId), "Dossier supprime.");
}

async function toggleGroup(groupId: string, collapsed: boolean): Promise<void> {
  await runLinksAction(() => backendClient.setLinkGroupCollapsed(groupId, collapsed), collapsed ? "Dossier masque." : "Dossier affiche.");
}

async function moveGroup(groupId: string, direction: number): Promise<void> {
  const index = links.value.findIndex((group) => group.id === groupId);
  if (index === -1) {
    return;
  }
  const ordered = reorderArray(links.value, index, direction).map((group) => group.id);
  await runLinksAction(() => backendClient.saveLinkGroupOrder(ordered), "Ordre des dossiers mis a jour.");
}

async function addLink(groupId: string, label: string, url: string): Promise<void> {
  await runLinksAction(() => backendClient.addLink(groupId, label, url), "Lien ajoute.");
}

async function updateLink(groupId: string, linkId: string, label: string, url: string): Promise<void> {
  await runLinksAction(() => backendClient.updateLink(groupId, linkId, label, url), "Lien modifie.");
}

async function deleteLink(groupId: string, linkId: string): Promise<void> {
  await runLinksAction(() => backendClient.deleteLink(groupId, linkId), "Lien supprime.");
}

async function moveLink(groupId: string, linkId: string, direction: number): Promise<void> {
  const group = links.value.find((item) => item.id === groupId);
  if (!group) {
    return;
  }
  const index = group.links.findIndex((item) => item.id === linkId);
  if (index === -1) {
    return;
  }
  const ordered = reorderArray(group.links, index, direction).map((link) => link.id);
  await runLinksAction(() => backendClient.saveLinkOrder(groupId, ordered), "Ordre des liens mis a jour.");
}

async function reorderLinks(groupId: string, orderedLinkIds: string[]): Promise<void> {
  await runLinksAction(() => backendClient.saveLinkOrder(groupId, orderedLinkIds), "Ordre des liens mis a jour.");
}

async function openLink(url: string): Promise<void> {
  try {
    await openUrl(url);
    statusMessage.value = "Lien ouvert.";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Impossible d'ouvrir le lien.";
  }
}

function onGroupDragStart(groupId: string): void {
  draggedGroupId.value = groupId;
  dragOverGroupId.value = groupId;
  document.body.style.userSelect = "none";
  document.body.style.cursor = "grabbing";
}

function onGroupDragEnter(groupId: string): void {
  if (!draggedGroupId.value || draggedGroupId.value === groupId) {
    return;
  }
  dragOverGroupId.value = groupId;
}

async function onGroupDragDrop(groupId: string): Promise<void> {
  if (!draggedGroupId.value || draggedGroupId.value === groupId) {
    onGroupDragEnd();
    return;
  }
  const orderedGroupIds = reorderIds(links.value, draggedGroupId.value, groupId);
  onGroupDragEnd();
  await runLinksAction(() => backendClient.saveLinkGroupOrder(orderedGroupIds), "Ordre des dossiers mis a jour.");
}

function onGroupDragEnd(): void {
  draggedGroupId.value = null;
  dragOverGroupId.value = null;
  document.body.style.userSelect = "";
  document.body.style.cursor = "";
}

function onGlobalPointerRelease(): void {
  const target = dragOverGroupId.value;
  if (draggedGroupId.value === null) {
    return;
  }
  if (target !== null && target !== draggedGroupId.value) {
    void onGroupDragDrop(target);
    return;
  }
  onGroupDragEnd();
}

onMounted(() => {
  window.addEventListener("pointerup", onGlobalPointerRelease);
  window.addEventListener("pointercancel", onGlobalPointerRelease);
  window.addEventListener("blur", onGlobalPointerRelease);
  void loadWorkspace();
});

onUnmounted(() => {
  window.removeEventListener("pointerup", onGlobalPointerRelease);
  window.removeEventListener("pointercancel", onGlobalPointerRelease);
  window.removeEventListener("blur", onGlobalPointerRelease);
  onGroupDragEnd();
});
</script>

<template>
  <div class="space-y-4">
    <section>
      <form class="grid gap-3 md:grid-cols-[1fr_auto]" @submit.prevent="addGroup">
        <input v-model="groupNameDraft" class="rounded-2xl border border-white/15 bg-[#16262f] px-4 py-3 text-sm placeholder:text-[var(--accent-strong)] outline-none focus:border-[#a7d246]/45" placeholder="Nom du nouveau dossier">
        <button class="rounded-2xl primary-btn px-5 py-3 text-sm font-semibold text-[#182311] disabled:opacity-50" :disabled="busy" type="submit">
          Nouveau dossier
        </button>
      </form>
    </section>

    <section class="space-y-3">
      <div v-if="loading" class="rounded-[22px] border border-white/6 bg-[#1b2f3a] px-6 py-10 text-center text-sm text-stone-300/75">
        Chargement...
      </div>
      <div v-else-if="!links.length" class="rounded-[22px] border border-dashed border-white/8 bg-[#1b2f3a] px-6 py-12 text-center text-sm text-stone-300/75">
        Aucun dossier pour le moment.
      </div>
      <template v-else>
        <LinkGroupCard
          v-for="(group, index) in links"
          :key="group.id"
          :group="group"
          :index="index"
          :total="links.length"
          :dragged-group-id="draggedGroupId"
          :drag-over-group-id="dragOverGroupId"
          @rename-group="renameGroup"
          @delete-group="deleteGroup"
          @toggle-group="toggleGroup"
          @move-group="moveGroup"
          @drag-start-group="onGroupDragStart"
          @drag-enter-group="onGroupDragEnter"
          @drag-drop-group="onGroupDragDrop"
          @drag-end-group="onGroupDragEnd"
          @add-link="addLink"
          @update-link="updateLink"
          @delete-link="deleteLink"
          @move-link="moveLink"
          @reorder-links="reorderLinks"
          @open-link="openLink"
        />
      </template>
    </section>

    <ToastStack :status-message="statusMessage" :error-message="errorMessage" />
  </div>
</template>
