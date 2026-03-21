<script setup lang="ts">
import { onUnmounted, ref } from "vue";

 type TabId = "characters" | "shortcuts" | "crafts" | "links" | "retro-familiars";

interface SettingsTab {
  id: TabId;
  label: string;
  visible: boolean;
  canHide: boolean;
}

defineProps<{
  tabs: SettingsTab[];
}>();

const emit = defineEmits<{
  (event: "update-tab-visibility", tabId: TabId, visible: boolean): void;
  (event: "reorder-tabs", tabId: TabId, targetTabId: TabId): void;
}>();

const draggedTabId = ref<TabId | null>(null);
const dragOverTabId = ref<TabId | null>(null);

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, button, label [data-no-drag], [data-no-drag='true']"));
}

function beginDrag(tabId: TabId, event: PointerEvent): void {
  if (event.button !== 0 || isInteractiveTarget(event.target)) {
    return;
  }
  draggedTabId.value = tabId;
  dragOverTabId.value = tabId;
  document.body.style.userSelect = "none";
  document.body.style.cursor = "grabbing";
}

function onDragEnter(tabId: TabId): void {
  if (draggedTabId.value === null || draggedTabId.value === tabId) {
    return;
  }
  dragOverTabId.value = tabId;
}

function endDrag(): void {
  draggedTabId.value = null;
  dragOverTabId.value = null;
  document.body.style.userSelect = "";
  document.body.style.cursor = "";
}

function onGlobalPointerRelease(): void {
  if (draggedTabId.value === null) {
    return;
  }
  const sourceId = draggedTabId.value;
  const targetId = dragOverTabId.value;
  endDrag();
  if (!targetId || sourceId === targetId) {
    return;
  }
  emit("reorder-tabs", sourceId, targetId);
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerup", onGlobalPointerRelease);
}

onUnmounted(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("pointerup", onGlobalPointerRelease);
  }
  endDrag();
});
</script>

<template>
  <section class="rounded-[24px] border border-white/8 bg-[#0c171d]/95 px-4 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
    <div class="mb-3 text-sm font-semibold text-[#f5f0e3]">Onglets visibles</div>
    <div class="space-y-2">
      <label
        v-for="tab in tabs"
        :key="tab.id"
        class="flex items-center justify-between gap-3 rounded-[16px] border px-4 py-3 transition"
        :class="[
          draggedTabId === tab.id ? 'cursor-grabbing border-[#4f6e3f] bg-[#18251d] shadow-[0_14px_30px_rgba(0,0,0,0.2)]' : 'cursor-grab border-white/6 bg-[#111a20]',
          dragOverTabId === tab.id && draggedTabId !== tab.id ? 'border-[#95c83d]/50 bg-[#152118]' : '',
        ]"
        @pointerdown="beginDrag(tab.id, $event)"
        @pointerenter="onDragEnter(tab.id)"
      >
        <div class="flex min-w-0 items-center gap-3">
          <span class="text-xs font-semibold tracking-[0.24em] text-[#95c83d]/80">:::</span>
          <span class="text-sm font-medium text-[#f5f0e3]">{{ tab.label }}</span>
        </div>
        <input
          :checked="tab.visible"
          :disabled="tab.visible && !tab.canHide"
          type="checkbox"
          class="h-4 w-4 accent-[#95c83d]"
          data-no-drag="true"
          @change="emit('update-tab-visibility', tab.id, ($event.target as HTMLInputElement).checked)"
        />
      </label>
    </div>
  </section>
</template>
