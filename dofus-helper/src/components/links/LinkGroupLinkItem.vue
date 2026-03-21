<script setup lang="ts">
import { ref, watch } from "vue";
import type { LinkItem } from "../../services/backendClient";
import LinkGroupIconButton from "./LinkGroupIconButton.vue";
import LinkGroupLinkModal from "./LinkGroupLinkModal.vue";

const props = defineProps<{
  link: LinkItem;
  index: number;
  total: number;
  dragging?: boolean;
  dragOver?: boolean;
}>();

const emit = defineEmits<{
  (event: "update-link", linkId: string, label: string, url: string): void;
  (event: "delete-link", linkId: string): void;
  (event: "move-link", linkId: string, direction: number): void;
  (event: "open-link", url: string): void;
  (event: "drag-start", linkId: string): void;
  (event: "drag-enter", linkId: string): void;
  (event: "drag-drop", linkId: string): void;
  (event: "drag-end"): void;
}>();

const editModalOpen = ref(false);
const editingLabel = ref(props.link.label);
const editingUrl = ref(props.link.url);

watch(
  () => props.link,
  (link) => {
    if (!editModalOpen.value) {
      editingLabel.value = link.label;
      editingUrl.value = link.url;
    }
  },
  { deep: true },
);

function beginEdit(): void {
  editingLabel.value = props.link.label;
  editingUrl.value = props.link.url;
  editModalOpen.value = true;
}

function cancelEdit(): void {
  editModalOpen.value = false;
  editingLabel.value = props.link.label;
  editingUrl.value = props.link.url;
}

function submitEdit(label: string, url: string): void {
  emit("update-link", props.link.id, label, url);
  editModalOpen.value = false;
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) {
    return;
  }
  emit("drag-start", props.link.id);
}

function onPointerEnter(): void {
  emit("drag-enter", props.link.id);
}

function onPointerUp(): void {
  emit("drag-drop", props.link.id);
}
</script>

<template>
  <div
    class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 py-1 rounded-none bg-transparent border-0 border-t border-t-[rgba(255,255,255,0.04)] cursor-grab first:border-t-0 first:pt-0.5 transition"
    :class="[
      dragging ? 'opacity-45' : '',
      dragOver ? 'rounded-[14px] bg-[rgba(167,210,70,0.08)] ring-1 ring-[#a7d246]/30 px-3 py-2' : '',
    ]"
    @pointerdown="onPointerDown"
    @pointerenter="onPointerEnter"
    @pointerup="onPointerUp"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="drag-surface flex min-w-0 flex-1 items-start gap-3" @pointerdown.prevent="onPointerDown">
        <span
          class="flex-none cursor-grab text-[rgba(157,177,165,0.72)] text-[10px] font-extrabold tracking-[0.16em] leading-none select-none pt-1"
          aria-hidden="true" title="Glissez-deposez pour reordonner.">
          :::
        </span>
        <div class="min-w-0 flex-1">
          <button class="text-left cursor-pointer" type="button" @click="emit('open-link', link.url)">
            <div class="block text-[13px] font-bold leading-[1.25]">{{ link.label }}</div>
            <div class="block mt-0.5 text-[var(--text-dim)] text-[11px] whitespace-nowrap overflow-hidden text-ellipsis break-normal">{{ link.url }}</div>
          </button>
        </div>
      </div>
      <div class="link-item-actions flex flex-wrap gap-2">
        <LinkGroupIconButton action="rename" label="Editer le lien" @click="beginEdit" />
        <LinkGroupIconButton action="delete" label="Supprimer le lien" danger @click="emit('delete-link', link.id)" />
      </div>
    </div>

    <LinkGroupLinkModal
      :open="editModalOpen"
      title="Modifier le lien"
      :subtitle="link.label"
      submit-label="Enregistrer"
      :initial-label="editingLabel"
      :initial-url="editingUrl"
      @close="cancelEdit"
      @submit="submitEdit"
    />
  </div>
</template>

<style scoped>
.drag-surface {
  cursor: grab;
}
</style>
