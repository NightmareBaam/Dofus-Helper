<script setup lang="ts">
import { ArrowExpand01Icon, SquareArrowShrink02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/vue";
import type { CharacterNotifType, CharactersConfig } from "../../services/backendClient";

defineProps<{
  busy: boolean;
  config: CharactersConfig;
  visibleTypes: CharacterNotifType[];
  typeMeta: Record<CharacterNotifType, { label: string; accent: string; iconOn: string; iconOff: string }>;
  windowsCount: number;
  showLogs: boolean;
  compactMode: boolean;
  isBulkEnabled: (notifType: CharacterNotifType) => boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  "set-filter": [gameType: "retro" | "unity", enabled: boolean];
  "set-copy-mp": [enabled: boolean];
  "toggle-logs": [];
  "toggle-compact": [];
  "set-all-rules": [notifType: CharacterNotifType, enabled: boolean];
}>();
</script>

<template>
  <section class="rounded-[26px] border border-white/7 bg-[#0c171d]/92 px-4 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
    <template v-if="compactMode">
      <div class="flex items-start justify-between gap-4">
        <div class="flex flex-wrap items-center gap-3">
          <button class="primary-btn min-w-[140px]" :disabled="busy" @click="emit('refresh')">Actualiser</button>

          <label class="inline-flex items-center gap-2 px-1 py-2 text-[13px] text-[#b7c5ba]">
            <input :checked="config.enableRetro" type="checkbox" class="accent-[#95c83d]"
              @change="emit('set-filter', 'retro', ($event.target as HTMLInputElement).checked)">
            <span>Retro</span>
          </label>

          <label class="inline-flex items-center gap-2 px-1 py-2 text-[13px] text-[#b7c5ba]">
            <input :checked="config.enableUnity" type="checkbox" class="accent-[#95c83d]"
              @change="emit('set-filter', 'unity', ($event.target as HTMLInputElement).checked)">
            <span>Unity</span>
          </label>

          <label class="inline-flex items-center gap-2 px-1 py-2 text-[13px] text-[#b7c5ba]">
            <input :checked="config.copyMpSender" type="checkbox" class="accent-[#95c83d]"
              @change="emit('set-copy-mp', ($event.target as HTMLInputElement).checked)">
            <span>Copie MP</span>
          </label>
        </div>

        <button
          type="button"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-white/8 bg-[#162127] text-[#c8d2cf] transition cursor-pointer hover:border-[#324b3c] hover:bg-[#172822] hover:text-[#f3f1e7]"
          :title="compactMode ? 'Vue normale' : 'Vue compacte'"
          @click="emit('toggle-compact')"
        >
          <HugeiconsIcon :icon="compactMode ? ArrowExpand01Icon : SquareArrowShrink02Icon" :size="18" :stroke-width="1.9" />
        </button>
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <button v-for="notifType in visibleTypes" :key="`bulk-${notifType}`" type="button"
          class="flex h-9 w-9 items-center justify-center rounded-[12px] border transition disabled:opacity-40"
          :class="isBulkEnabled(notifType) ? typeMeta[notifType].accent : 'border-white/8 bg-[#20343f] text-stone-300/85'"
          :disabled="busy || !windowsCount" :title="`${typeMeta[notifType].label} pour tous`"
          @click="emit('set-all-rules', notifType, !isBulkEnabled(notifType))">
          <img :src="isBulkEnabled(notifType) ? typeMeta[notifType].iconOn : typeMeta[notifType].iconOff"
            :alt="typeMeta[notifType].label" class="h-5 w-5 object-contain">
        </button>
      </div>
    </template>

    <template v-else>
      <div class="flex flex-wrap items-center gap-3">
        <button class="primary-btn min-w-[140px]" :disabled="busy" @click="emit('refresh')">Actualiser</button>

        <label class="inline-flex items-center gap-2 px-1 py-2 text-[13px] text-[#b7c5ba]">
          <input :checked="config.enableRetro" type="checkbox" class="accent-[#95c83d]"
            @change="emit('set-filter', 'retro', ($event.target as HTMLInputElement).checked)">
          <span>Retro</span>
        </label>

        <label class="inline-flex items-center gap-2 px-1 py-2 text-[13px] text-[#b7c5ba]">
          <input :checked="config.enableUnity" type="checkbox" class="accent-[#95c83d]"
            @change="emit('set-filter', 'unity', ($event.target as HTMLInputElement).checked)">
          <span>Unity</span>
        </label>

        <label class="inline-flex items-center gap-2 px-1 py-2 text-[13px] text-[#b7c5ba]">
          <input :checked="config.copyMpSender" type="checkbox" class="accent-[#95c83d]"
            @change="emit('set-copy-mp', ($event.target as HTMLInputElement).checked)">
          <span>Copie MP</span>
        </label>

        <button v-for="notifType in visibleTypes" :key="`bulk-${notifType}`" type="button"
          class="flex h-9 w-9 items-center justify-center rounded-[12px] border transition disabled:opacity-40"
          :class="isBulkEnabled(notifType) ? typeMeta[notifType].accent : 'border-white/8 bg-[#20343f] text-stone-300/85'"
          :disabled="busy || !windowsCount" :title="`${typeMeta[notifType].label} pour tous`"
          @click="emit('set-all-rules', notifType, !isBulkEnabled(notifType))">
          <img :src="isBulkEnabled(notifType) ? typeMeta[notifType].iconOn : typeMeta[notifType].iconOff"
            :alt="typeMeta[notifType].label" class="h-5 w-5 object-contain">
        </button>

        <button type="button"
          class="rounded-[16px] border border-white/8 bg-[#213742] px-4 py-3 text-[13px] text-[#d7dfdc]"
          @click="emit('toggle-logs')">
          {{ showLogs ? 'Masquer le journal' : 'Journal de notifications' }}
        </button>

        <button
          type="button"
          class="ml-auto flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/8 bg-[#162127] text-[#c8d2cf] transition cursor-pointer hover:border-[#324b3c] hover:bg-[#172822] hover:text-[#f3f1e7]"
          :title="compactMode ? 'Vue normale' : 'Vue compacte'"
          @click="emit('toggle-compact')"
        >
          <HugeiconsIcon :icon="compactMode ? ArrowExpand01Icon : SquareArrowShrink02Icon" :size="18" :stroke-width="1.9" />
        </button>
      </div>
    </template>
  </section>
</template>
