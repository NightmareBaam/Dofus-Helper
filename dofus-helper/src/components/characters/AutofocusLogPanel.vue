<script setup lang="ts">
import type { AutofocusLogEntry } from "../../services/backendClient";

defineProps<{
  logs: AutofocusLogEntry[];
  logTone: (tag: string) => string;
}>();
</script>

<template>
  <section class="rounded-[18px] border border-white/6 bg-[#182a33] p-3">
    <div class="max-h-[320px] space-y-3 overflow-auto pr-1">
      <div v-if="!logs.length" class="rounded-[14px] border border-dashed border-white/10 bg-white/5 px-4 py-5 text-[13px] text-stone-300/70">
        Aucun evenement AutoFocus pour le moment.
      </div>
      <article v-for="entry in logs" :key="entry.id" class="rounded-[14px] border px-4 py-3 text-[13px]" :class="logTone(entry.tag)">
        <div class="flex flex-wrap items-center gap-3">
          <span class="font-mono text-xs text-current/70">{{ entry.timestamp }}</span>
          <span class="rounded-full border border-current/15 px-2 py-1 text-[10px] uppercase tracking-[0.12em]">{{ entry.tag }}</span>
        </div>
        <p class="mt-2 whitespace-pre-wrap break-words leading-6">{{ entry.message }}</p>
      </article>
    </div>
  </section>
</template>
