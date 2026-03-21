<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  statusMessage: string;
  errorMessage: string;
}>();

const visibleStatus = ref("");
const visibleError = ref("");
let statusTimer: number | null = null;
let errorTimer: number | null = null;

function clearStatusTimer(): void {
  if (statusTimer !== null) {
    window.clearTimeout(statusTimer);
    statusTimer = null;
  }
}

function clearErrorTimer(): void {
  if (errorTimer !== null) {
    window.clearTimeout(errorTimer);
    errorTimer = null;
  }
}

watch(() => props.statusMessage, (value) => {
  clearStatusTimer();
  visibleStatus.value = value;
  if (!value) {
    return;
  }
  statusTimer = window.setTimeout(() => {
    visibleStatus.value = "";
    statusTimer = null;
  }, 3200);
});

watch(() => props.errorMessage, (value) => {
  clearErrorTimer();
  visibleError.value = value;
  if (!value) {
    return;
  }
  errorTimer = window.setTimeout(() => {
    visibleError.value = "";
    errorTimer = null;
  }, 4800);
});
</script>

<template>
  <div class="pointer-events-none fixed bottom-5 right-5 z-40 flex w-full max-w-sm flex-col gap-2">
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-2 opacity-0"
    >
      <div
        v-if="visibleStatus"
        class="pointer-events-auto overflow-hidden rounded-[18px] border border-[#9fe0b0]/30 bg-[linear-gradient(135deg,rgba(26,64,48,0.96),rgba(34,87,56,0.94))] px-4 py-3 text-[13px] text-[#effbef] shadow-[0_16px_40px_rgba(0,0,0,0.32)] backdrop-blur"
      >
        <div class="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#b8f2c6]/90">Succes</div>
        <div>{{ visibleStatus }}</div>
      </div>
    </transition>
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-2 opacity-0"
    >
      <div
        v-if="visibleError"
        class="pointer-events-auto overflow-hidden rounded-[18px] border border-rose-300/20 bg-[#3a1e24]/95 px-4 py-3 text-[13px] text-rose-100 shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur"
      >
        <div class="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-200/85">Erreur</div>
        <div>{{ visibleError }}</div>
      </div>
    </transition>
  </div>
</template>
