<script setup lang="ts">
import { ref, watch } from "vue";
import { buildBackendUrl, type RetroFamiliarEntry } from "../../services/backendClient";

const props = defineProps<{
  open: boolean;
  entry: RetroFamiliarEntry | null;
  serverSuggestions: string[];
  characterSuggestions: string[];
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "save", payload: { entryId: string; serverName: string; characterName: string }): void;
  (event: "delete", entryId: string): void;
}>();

const serverName = ref("");
const characterName = ref("");

watch(
  () => props.open,
  (open) => {
    if (!open || !props.entry) {
      return;
    }
    serverName.value = props.entry.serverName ?? "";
    characterName.value = props.entry.characterName ?? "";
  },
);

function imageUrl(): string {
  return props.entry?.familiar.imageName ? buildBackendUrl(`/api/familiars/retro/images/${encodeURIComponent(props.entry.familiar.imageName)}`) : "";
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Jamais";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Jamais";
  }
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function closeModal(): void {
  emit("close");
}

function saveModal(): void {
  if (!props.entry) {
    return;
  }
  emit("save", {
    entryId: props.entry.id,
    serverName: serverName.value.trim(),
    characterName: characterName.value.trim(),
  });
}

function deleteEntry(): void {
  if (!props.entry) {
    return;
  }
  emit("delete", props.entry.id);
}
</script>

<template>
  <div
    v-if="open && entry"
    class="fixed inset-0 z-40 flex items-center justify-center bg-[#081117]/70 px-4 backdrop-blur-sm"
    @click.self="closeModal"
  >
    <div class="w-full max-w-4xl rounded-[22px] border border-white/8 bg-[#1b2d38] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
      <div class="flex items-start justify-between gap-4">
        <div class="flex min-w-0 items-start gap-4">
          <img
            v-if="entry.familiar.imageName"
            :src="imageUrl()"
            :alt="entry.familiar.name"
            class="h-[92px] w-[92px] shrink-0 rounded-[18px] border border-white/8 bg-[#101a20] object-contain p-3"
          >
          <div class="min-w-0">
            <h3 class="text-[20px] font-semibold text-[#f5f0e3]">{{ entry.familiar.name }}</h3>
          </div>
        </div>
        <button
          type="button"
          class="rounded-[16px] border border-white/12 bg-[#213742] px-5 py-3 text-base text-stone-100 cursor-pointer"
          @click="closeModal"
        >
          Fermer
        </button>
      </div>

      <div class="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section class="rounded-[22px] border border-white/8 bg-[#101a20] p-5">
          <div class="text-[16px] font-semibold text-[#f5f0e3]">Informations</div>
          <div class="mt-5 grid gap-4 sm:grid-cols-2">
            <label class="grid gap-2">
              <span class="text-sm text-stone-300/80">Serveur</span>
              <input
                v-model="serverName"
                list="retro-familiar-edit-server-suggestions"
                class="w-full rounded-2xl border border-white/8 bg-[#1a2b36] px-4 py-3 text-sm text-white outline-none placeholder:text-stone-500 focus:border-[#a7d246]/45"
                placeholder="Optionnel"
              >
            </label>
            <label class="grid gap-2">
              <span class="text-sm text-stone-300/80">Personnage</span>
              <input
                v-model="characterName"
                list="retro-familiar-edit-character-suggestions"
                class="w-full rounded-2xl border border-white/8 bg-[#1a2b36] px-4 py-3 text-sm text-white outline-none placeholder:text-stone-500 focus:border-[#a7d246]/45"
                placeholder="Optionnel"
              >
            </label>
          </div>
        </section>

        <aside class="space-y-3">
          <div class="rounded-[18px] border border-white/6 bg-[#101a20] p-4">
            <div class="text-[11px] uppercase tracking-[0.14em] text-[#7f8c86]">Dernier repas</div>
            <div class="mt-2 text-sm font-semibold text-[#f5f0e3]">{{ formatDate(entry.lastFedAt) }}</div>
          </div>
          <div class="rounded-[18px] border border-white/6 bg-[#101a20] p-4">
            <div class="text-[11px] uppercase tracking-[0.14em] text-[#7f8c86]">Prochain repas a partir de</div>
            <div class="mt-2 text-sm font-semibold text-[#f5f0e3]">{{ formatDate(entry.status.nextFeedAt) }}</div>
          </div>
          <div class="rounded-[18px] border border-white/6 bg-[#101a20] p-4">
            <div class="text-[11px] uppercase tracking-[0.14em] text-[#7f8c86]">Repas en retard a partir de</div>
            <div class="mt-2 text-sm font-semibold text-[#f5f0e3]">{{ formatDate(entry.status.lateFeedAt) }}</div>
          </div>
        </aside>
      </div>

      <footer class="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          class="rounded-[16px] border border-rose-300/14 bg-rose-500/10 px-4 py-2.5 text-sm font-medium text-rose-100 transition hover:border-rose-300/24 cursor-pointer"
          @click="deleteEntry"
        >
          Supprimer
        </button>
        <button
          type="button"
          class="rounded-2xl primary-btn px-4 py-3 text-sm font-semibold text-[#182311] cursor-pointer"
          @click="saveModal"
        >
          Enregistrer
        </button>
      </footer>
    </div>
  </div>
  <datalist id="retro-familiar-edit-server-suggestions">
    <option v-for="server in serverSuggestions" :key="server" :value="server" />
  </datalist>
  <datalist id="retro-familiar-edit-character-suggestions">
    <option v-for="character in characterSuggestions" :key="character" :value="character" />
  </datalist>
</template>
