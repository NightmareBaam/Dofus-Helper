<script setup lang="ts">
const props = defineProps<{
  label: string;
  tone: "ready" | "partial" | "pending" | "live";
}>();

const classes = {
  ready: "bg-emerald-500/15 text-emerald-200 ring-emerald-400/30",
  partial: "bg-amber-500/15 text-amber-100 ring-amber-300/30",
  pending: "bg-slate-400/10 text-slate-200 ring-white/10",
  live: "bg-sky-500/15 text-sky-100 ring-sky-300/30",
} as const;
</script>

<template>
  <span class="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ring-1" :class="classes[props.tone]">
    {{ props.label }}
  </span>
</template>
