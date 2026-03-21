<script setup lang="ts">
import type { ShortcutDebugEvent } from "../../services/backendClient";

defineProps<{
  events: ShortcutDebugEvent[];
}>();
</script>

<template>
  <section class="rounded-[22px] border border-white/15  p-4">
    <div class="max-h-[320px] space-y-3 overflow-auto pr-1">
      <div v-if="!events.length" class="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-sm text-stone-300/70">
        Aucun evenement capture.
      </div>
      <article v-for="event in events" :key="event.id" class="rounded-2xl border px-4 py-3 text-sm" :class="event.recognized ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100' : 'border-amber-300/20 bg-amber-500/10 text-amber-100'">
        <div class="flex flex-wrap items-center gap-3">
          <span class="font-mono text-xs text-current/70">{{ event.timestamp }}</span>
          <span class="rounded-full border border-current/15 px-2 py-1 text-[11px] uppercase tracking-[0.14em]">{{ event.recognized ? 'reconnue' : 'ignoree' }}</span>
        </div>
        <p class="mt-2 break-words font-semibold">{{ event.shortcut }}</p>
      </article>
    </div>
  </section>
</template>
