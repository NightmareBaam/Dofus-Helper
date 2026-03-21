<script setup lang="ts">
import type { CharacterNotifType, CharacterWindow } from "../../services/backendClient";

const props = defineProps<{
  window: CharacterWindow;
  index: number;
  busy: boolean;
  compactMode: boolean;
  captureActive: boolean;
  visibleTypes: CharacterNotifType[];
  typeMeta: Record<CharacterNotifType, { label: string; accent: string; iconOn: string; iconOff: string }>;
  draggedHwnd: number | null;
  dragOverHwnd: number | null;
}>();

const emit = defineEmits<{
  "toggle-rule": [window: CharacterWindow, notifType: CharacterNotifType];
  "toggle-rotation": [window: CharacterWindow];
  "capture-shortcut": [window: CharacterWindow];
  "clear-shortcut": [window: CharacterWindow];
  focus: [hwnd: number];
  "drag-start": [hwnd: number];
  "drag-enter": [hwnd: number];
  "drag-drop": [hwnd: number];
  "drag-end": [];
}>();

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) {
    return;
  }
  emit("drag-start", props.window.hwnd);
}

function onPointerEnter(): void {
  emit("drag-enter", props.window.hwnd);
}

function onPointerUp(): void {
  emit("drag-drop", props.window.hwnd);
}
</script>

<template>
  <div
    class="grid border border-[rgba(112,154,88,0.12)] bg-[linear-gradient(180deg,rgba(31,48,59,0.96),rgba(26,40,49,0.96))] shadow-[var(--shadow)] cursor-grab"
    :class="[
      compactMode
        ? 'grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 rounded-[18px]'
        : 'grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3.5 px-[18px] py-3 rounded-2xl',
      draggedHwnd === window.hwnd ? 'opacity-50' : '',
      dragOverHwnd === window.hwnd && draggedHwnd !== window.hwnd ? 'border-[#a7d246] ring-2 ring-[#a7d246]/30' : '',
    ]" @pointerenter="onPointerEnter" @pointerup="onPointerUp">
    <div class="character-index text-center font-bold text-[var(--accent)]"
      :class="compactMode ? 'text-[16px]' : 'text-[22px]'"
      @pointerdown.prevent.stop="onPointerDown" @pointerup.stop="onPointerUp">
      {{ String(index + 1).padStart(2, '0') }}
    </div>
    <div class="min-w-0">
      <div class="truncate font-bold" :class="compactMode ? 'text-[14px]' : 'text-[16px]'">{{ window.pseudo }}</div>
      <div
        class="mt-1.5 text-xs font-extrabold tracking-[0.08em]"
        :class="[compactMode ? 'mt-0.5 text-[11px]' : 'mt-1', window.gameType === 'retro' ? 'text-[var(--retro)]' : 'text-[var(--unity)]']"
      >
        {{ window.gameType.toUpperCase() }}
      </div>
    </div>
    <div class="flex items-center gap-1.5" :class="compactMode ? 'min-w-0 flex-nowrap' : 'flex-wrap gap-2'">
      <div class="flex items-center gap-1.5">
        <button type="button"
          class="truncate rounded-[12px] border font-semibold uppercase tracking-[0.08em] transition"
          :class="[
            compactMode ? 'max-w-[72px] px-2 py-1 text-[10px]' : 'max-w-[120px] px-3 py-1.5 text-[11px]',
            captureActive ? 'border-[#a7d246]/45 bg-[#22333b] text-[#dff5a8]' : 'border-white/8 bg-[#16262f] text-stone-200',
          ]"
          :disabled="busy" :title="window.shortcut || 'Definir un raccourci'" @click="emit('capture-shortcut', window)">
          {{ captureActive ? 'Appuyez...' : (window.shortcut || 'Raccourci') }}
        </button>
        <button v-if="captureActive || window.shortcut" type="button"
          class="flex items-center justify-center rounded-[10px] border border-white/8 bg-[#16262f] text-stone-300 transition hover:text-rose-100"
          :class="compactMode ? 'h-6 w-6' : 'h-7 w-7'"
          :disabled="busy" title="Supprimer le raccourci" @click="emit('clear-shortcut', window)">
          <svg viewBox="0 0 24 24" class="fill-current" :class="compactMode ? 'h-3 w-3' : 'h-3.5 w-3.5'" aria-hidden="true">
            <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 7h2v7h-2v-7zm4 0h2v7h-2v-7zM7 10h2v7H7v-7zm1 10h8a2 2 0 0 0 2-2V8H6v10a2 2 0 0 0 2 2z" />
          </svg>
        </button>
      </div>
      <button type="button" class="flex items-center justify-center rounded-[14px] border transition"
        :class="[
          compactMode ? 'h-7 w-7' : 'h-9 w-9',
          window.rotationEnabled ? 'border-emerald-300/20 bg-emerald-500/15 text-emerald-100' : 'border-white/8 bg-[#213742] text-stone-200',
        ]"
        :disabled="busy" title="Rotation" @click="emit('toggle-rotation', window)">
        <svg viewBox="0 0 24 24" class="fill-current" :class="compactMode ? 'h-4 w-4' : 'h-5 w-5'" aria-hidden="true">
          <path d="M12 5a7 7 0 1 1-6.1 3.6l1.8 1A5 5 0 1 0 12 7h-1.8l2.8-3 2.8 3H12z" />
        </svg>
      </button>
      <button v-for="notifType in visibleTypes" :key="`${window.hwnd}-${notifType}`" type="button"
        class="flex items-center justify-center rounded-[12px] border transition disabled:opacity-40"
        :class="[
          compactMode ? 'h-7 w-7' : 'h-8 w-8',
          window.rule[notifType] !== false ? typeMeta[notifType].accent : 'border-white/8 bg-[#1a2b34] text-stone-300/85',
        ]"
        :disabled="busy" :title="typeMeta[notifType].label" @click="emit('toggle-rule', window, notifType)">
        <img :src="window.rule[notifType] !== false ? typeMeta[notifType].iconOn : typeMeta[notifType].iconOff"
          :alt="typeMeta[notifType].label" class="object-contain" :class="compactMode ? 'h-4 w-4' : 'h-5 w-5'">
      </button>
    </div>
  </div>
</template>
