<script setup lang="ts">
import { ref, watch } from "vue";
import type { LinkGroup } from "../../services/backendClient";
import LinkGroupIconButton from "./LinkGroupIconButton.vue";

const props = defineProps<{
  group: LinkGroup;
  index: number;
  total: number;
}>();

const emit = defineEmits<{
  (event: "rename-group", groupId: string, name: string): void;
  (event: "delete-group", groupId: string): void;
  (event: "toggle-group", groupId: string, collapsed: boolean): void;
  (event: "move-group", groupId: string, direction: number): void;
  (event: "open-add-link"): void;
}>();

const groupNameDraft = ref(props.group.name);
const showRename = ref(false);

watch(
  () => props.group.name,
  (name) => {
    if (!showRename.value) {
      groupNameDraft.value = name;
    }
  },
);

function beginRename(): void {
  groupNameDraft.value = props.group.name;
  showRename.value = true;
}

function cancelRename(): void {
  groupNameDraft.value = props.group.name;
  showRename.value = false;
}

function submitRename(): void {
  const nextName = groupNameDraft.value.trim();
  if (!nextName) {
    return;
  }
  emit("rename-group", props.group.id, nextName);
  showRename.value = false;
}

</script>

<template>
  <header class="flex flex-wrap items-start justify-between gap-4" data-group-drag>
    <div class="drag-surface flex items-start gap-4">
      <span
        class="flex-none cursor-grab text-[rgba(157,177,165,0.72)] text-[10px] font-extrabold tracking-[0.16em] leading-none select-none pt-1"
        aria-hidden="true" title="Glissez-deposez pour reordonner.">
        :::
      </span>
      <div class="min-w-0 flex gap-[10px] items-start">
        <div v-if="!showRename">
          <h4>{{ group.name }}</h4>
          <div class="mt-1 text-[var(--text-dim)] text-xs">{{ group.links.length }} lien<span
              v-if="group.links.length > 1">s</span></div>
        </div>
        <form v-else class="mt-2 flex flex-wrap gap-2" @submit.prevent="submitRename">
          <input v-model="groupNameDraft"
            class="min-w-[220px] rounded-2xl border border-white/8 bg-[#16262f] px-4 py-2 text-sm text-white outline-none placeholder:text-stone-500 focus:border-[#a7d246]/45"
            placeholder="Nom du dossier">
          <button class="rounded-2xl primary-btn px-4 py-2 text-sm font-semibold text-[#182311]"
            type="submit">Valider</button>
          <button class="rounded-2xl border border-white/8 bg-[#213742] px-4 py-2 text-sm text-stone-200" type="button"
            @click="cancelRename">Annuler</button>
        </form>
      </div>
    </div>

    <div class="flex flex-wrap gap-2" data-no-drag>
      <LinkGroupIconButton action="add" label="Ajouter un lien" @click="emit('open-add-link')" />
      <LinkGroupIconButton
        action="toggle"
        :label="group.collapsed ? 'Afficher le dossier' : 'Masquer le dossier'"
        :icon-key="group.collapsed ? 'eye-off' : 'eye'"
        @click="emit('toggle-group', group.id, !group.collapsed)"
      />
      <LinkGroupIconButton action="rename" label="Renommer le dossier" @click="beginRename" />
      <LinkGroupIconButton action="delete" label="Supprimer le dossier" danger @click="emit('delete-group', group.id)" />
    </div>
  </header>
</template>

<style scoped>
.drag-surface {
  cursor: grab;
}
</style>
