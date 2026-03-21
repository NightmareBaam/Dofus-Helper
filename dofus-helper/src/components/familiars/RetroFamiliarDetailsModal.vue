<script setup lang="ts">
import RetroFamiliarDetailsContent from "./RetroFamiliarDetailsContent.vue";
import { type RetroFamiliarEntry } from "../../services/backendClient";

defineProps<{
  open: boolean;
  entry: RetroFamiliarEntry | null;
}>();

const emit = defineEmits<{
  (event: "close"): void;
}>();
</script>

<template>
  <div
    v-if="open && entry"
    class="fixed inset-0 z-40 flex items-center justify-center bg-[#081117]/70 px-4 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="w-full max-w-3xl rounded-[22px] border border-white/8 bg-[#1b2d38] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
      <div class="flex justify-end">
        <button
          type="button"
          class="rounded-[14px] border border-white/12 bg-[#213742] px-4 py-2.5 text-sm text-stone-100 cursor-pointer"
          @click="emit('close')"
        >
          Fermer
        </button>
      </div>

      <RetroFamiliarDetailsContent :item="entry.familiar" />
    </div>
  </div>
</template>
