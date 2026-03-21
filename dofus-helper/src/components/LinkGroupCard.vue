<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import type { LinkGroup } from "../services/backendClient";
import LinkGroupCardHeader from "./links/LinkGroupCardHeader.vue";
import LinkGroupLinkModal from "./links/LinkGroupLinkModal.vue";
import LinkGroupLinkItem from "./links/LinkGroupLinkItem.vue";

const props = defineProps<{
  group: LinkGroup;
  index: number;
  total: number;
  draggedGroupId?: string | null;
  dragOverGroupId?: string | null;
}>();

const emit = defineEmits<{
  (event: "rename-group", groupId: string, name: string): void;
  (event: "delete-group", groupId: string): void;
  (event: "toggle-group", groupId: string, collapsed: boolean): void;
  (event: "move-group", groupId: string, direction: number): void;
  (event: "drag-start-group", groupId: string): void;
  (event: "drag-enter-group", groupId: string): void;
  (event: "drag-drop-group", groupId: string): void;
  (event: "drag-end-group"): void;
  (event: "add-link", groupId: string, label: string, url: string): void;
  (event: "update-link", groupId: string, linkId: string, label: string, url: string): void;
  (event: "delete-link", groupId: string, linkId: string): void;
  (event: "move-link", groupId: string, linkId: string, direction: number): void;
  (event: "reorder-links", groupId: string, orderedLinkIds: string[]): void;
  (event: "open-link", url: string): void;
}>();

const addLinkModalOpen = ref(false);
const draggedLinkId = ref<string | null>(null);
const dragOverLinkId = ref<string | null>(null);

function openAddLinkModal(): void {
  addLinkModalOpen.value = true;
}

function closeAddLinkModal(): void {
  addLinkModalOpen.value = false;
}

function submitAddLink(label: string, url: string): void {
  emit("add-link", props.group.id, label, url);
  addLinkModalOpen.value = false;
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

function onGroupDragStart(): void {
  emit("drag-start-group", props.group.id);
}

function onGroupPointerDown(event: PointerEvent): void {
  if (event.button !== 0) {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (!target?.closest("[data-group-drag]")) {
    return;
  }
  if (target.closest("button, input, textarea, form, a, [data-no-drag]")) {
    return;
  }
  onGroupDragStart();
}

function onGroupPointerEnter(): void {
  emit("drag-enter-group", props.group.id);
}

function onGroupPointerUp(): void {
  emit("drag-drop-group", props.group.id);
}

function onLinkDragStart(linkId: string): void {
  draggedLinkId.value = linkId;
  dragOverLinkId.value = linkId;
  document.body.style.userSelect = "none";
  document.body.style.cursor = "grabbing";
}

function onLinkDragEnter(linkId: string): void {
  if (!draggedLinkId.value || draggedLinkId.value === linkId) {
    return;
  }
  dragOverLinkId.value = linkId;
}

function onLinkDragDrop(linkId: string): void {
  if (!draggedLinkId.value || draggedLinkId.value === linkId) {
    onLinkDragEnd();
    return;
  }
  const orderedLinkIds = reorderIds(props.group.links, draggedLinkId.value, linkId);
  onLinkDragEnd();
  emit("reorder-links", props.group.id, orderedLinkIds);
}

function onLinkDragEnd(): void {
  draggedLinkId.value = null;
  dragOverLinkId.value = null;
  document.body.style.userSelect = "";
  document.body.style.cursor = "";
}

function onLinkGlobalPointerRelease(): void {
  const target = dragOverLinkId.value;
  if (draggedLinkId.value === null) {
    return;
  }
  if (target !== null && target !== draggedLinkId.value) {
    onLinkDragDrop(target);
    return;
  }
  onLinkDragEnd();
}

onMounted(() => {
  window.addEventListener("pointerup", onLinkGlobalPointerRelease);
  window.addEventListener("pointercancel", onLinkGlobalPointerRelease);
  window.addEventListener("blur", onLinkGlobalPointerRelease);
});

onUnmounted(() => {
  window.removeEventListener("pointerup", onLinkGlobalPointerRelease);
  window.removeEventListener("pointercancel", onLinkGlobalPointerRelease);
  window.removeEventListener("blur", onLinkGlobalPointerRelease);
  onLinkDragEnd();
});
</script>

<template>
  <article
    class="px-[18px] pt-4 pb-[14px] rounded-[22px] bg-[linear-gradient(180deg,rgba(25,42,52,0.94),rgba(20,35,44,0.92))] border border-[rgba(255,255,255,0.05)] shadow-[0_10px_26px_rgba(0,0,0,0.14)] cursor-grab font-type transition"
    :class="[
      draggedGroupId === group.id ? 'opacity-55' : '',
      dragOverGroupId === group.id && draggedGroupId !== group.id ? 'border-[#a7d246] ring-2 ring-[#a7d246]/30' : '',
    ]"
    @pointerdown="onGroupPointerDown"
    @pointerenter="onGroupPointerEnter"
    @pointerup="onGroupPointerUp"
  >
    <LinkGroupCardHeader :group="group" :index="index" :total="total"
      @rename-group="(groupId, name) => emit('rename-group', groupId, name)"
      @delete-group="(groupId) => emit('delete-group', groupId)"
      @toggle-group="(groupId, collapsed) => emit('toggle-group', groupId, collapsed)"
      @move-group="(groupId, direction) => emit('move-group', groupId, direction)" @open-add-link="openAddLinkModal" />

    <div v-if="!group.collapsed" class="mt-4 space-y-4">
      <div v-if="!group.links.length"
        class="rounded-[18px] border border-dashed border-white/10 bg-[#1a2b34] px-5 py-8 text-center text-sm text-stone-400">
        Aucun lien dans ce dossier.
      </div>

      <div class="grid gap-0 mt-3 ml-6 pl-5 border-l border-l-[rgba(255,255,255,0.08)]">
        <LinkGroupLinkItem v-for="(link, linkIndex) in group.links" :key="link.id" :link="link" :index="linkIndex"
          :total="group.links.length" :dragging="draggedLinkId === link.id"
          :drag-over="dragOverLinkId === link.id && draggedLinkId !== link.id"
          @update-link="(linkId, label, url) => emit('update-link', group.id, linkId, label, url)"
          @delete-link="(linkId) => emit('delete-link', group.id, linkId)"
          @move-link="(linkId, direction) => emit('move-link', group.id, linkId, direction)"
          @open-link="(url) => emit('open-link', url)" @drag-start="onLinkDragStart" @drag-enter="onLinkDragEnter"
          @drag-drop="onLinkDragDrop" @drag-end="onLinkDragEnd" />
      </div>

    </div>

    <LinkGroupLinkModal
      :open="addLinkModalOpen"
      title="Ajouter un lien"
      :subtitle="group.name"
      submit-label="Ajouter"
      initial-url="https://"
      @close="closeAddLinkModal"
      @submit="submitAddLink"
    />
  </article>
</template>

<style>
.font-type {
  font-family: "Palatino Linotype", serif;
}
</style>
