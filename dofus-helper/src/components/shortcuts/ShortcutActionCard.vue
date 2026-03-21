<script setup lang="ts">
import type { ShortcutAction } from "../../services/backendClient";

defineProps<{
  action: ShortcutAction;
  title: string;
  subtitle: string;
  value: string | null;
  captureActive: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{
  capture: [action: ShortcutAction];
  clear: [action: ShortcutAction];
}>();
</script>
<template>
  <article class="rounded-[22px] border border-white/15 px-5 py-4">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 class="text-xl font-semibold text-[#f5f0e3]">{{ title }}</h2>
        <p class="mt-1 text-sm text-[#9aa8a2]">{{ subtitle }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <input class="min-w-[180px] text-[var(--accent-strong)] rounded-2xl border border-white/8 bg-[#16262f] px-4 py-2.5 text-s outline-none text-center" :value="captureActive ? 'Appuyez...' : (value || 'Aucun')" readonly>
        <button class="rounded-2xl primary-btn border border-white/8 px-4 py-2.5 text-sm font-semibold text-stone-100 disabled:opacity-40 cursor-pointer" :disabled="busy" @click="emit('capture', action)">
          {{ captureActive ? 'Ecoute...' : 'Capturer' }}
        </button>
        <button class="rounded-2xl primary-btn px-4 py-2.5 text-sm font-semibold text-stone-100 disabled:opacity-40 cursor-pointer" :disabled="busy" @click="emit('clear', action)">
          Aucun
        </button>
      </div>
    </div>
  </article>
</template>
