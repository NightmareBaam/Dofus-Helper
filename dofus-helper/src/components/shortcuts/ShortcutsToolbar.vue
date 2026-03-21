<script setup lang="ts">
import type { ShortcutsState } from "../../services/backendClient";

defineProps<{
  busy: boolean;
  shortcutsState: ShortcutsState;
  showDebug: boolean;
}>();

const emit = defineEmits<{
  apply: [];
  "set-debug": [enabled: boolean];
  "toggle-debug-panel": [];
}>();
</script>

<template>
  <div class="flex flex-wrap items-center gap-3">
    <button class="primary-btn" :disabled="busy" @click="emit('apply')">
      Appliquer
    </button>
    <label class="toggle">
      <input :checked="shortcutsState.debugEnabled" type="checkbox" :disabled="busy"
        @change="emit('set-debug', ($event.target as HTMLInputElement).checked)">
      <span>Debug</span>
    </label>
    <button type="button" class="rounded-2xl border border-white/8 bg-[#213742] px-4 py-2.5 text-sm text-[#d7dfdc]"
      @click="emit('toggle-debug-panel')">
      {{ showDebug ? 'Masquer le journal' : 'Afficher le journal' }}
    </button>
  </div>
</template>
