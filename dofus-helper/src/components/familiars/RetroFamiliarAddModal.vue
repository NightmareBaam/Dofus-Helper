<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { buildBackendUrl, type RetroFamiliarItem } from "../../services/backendClient";

const props = defineProps<{
  open: boolean;
  items: RetroFamiliarItem[];
  serverSuggestions: string[];
  characterSuggestions: string[];
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "submit", payload: { familiarKey: string; serverName: string; characterName: string }): void;
}>();

const query = ref("");
const selectedKey = ref("");
const serverName = ref("");
const characterName = ref("");

const filteredItems = computed(() => {
  const normalizedQuery = query.value.trim().toLowerCase();
  if (!normalizedQuery) {
    return props.items;
  }
  return props.items.filter((item) => item.name.toLowerCase().includes(normalizedQuery));
});

watch(
  () => props.open,
  (open) => {
    if (!open) {
      return;
    }
    query.value = "";
    selectedKey.value = props.items[0]?.key ?? "";
    serverName.value = "";
    characterName.value = "";
  },
);

watch(filteredItems, (items) => {
  if (!items.some((item) => item.key === selectedKey.value)) {
    selectedKey.value = items[0]?.key ?? "";
  }
});

function imageUrl(item: RetroFamiliarItem): string {
  return item.imageName ? buildBackendUrl(`/api/familiars/retro/images/${encodeURIComponent(item.imageName)}`) : "";
}

function closeModal(): void {
  emit("close");
}

function submitModal(): void {
  if (!selectedKey.value) {
    return;
  }
  emit("submit", {
    familiarKey: selectedKey.value,
    serverName: serverName.value.trim(),
    characterName: characterName.value.trim(),
  });
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-40 flex items-center justify-center bg-[#081117]/70 px-4 backdrop-blur-sm"
    @click.self="closeModal"
  >
    <div class="w-full max-w-2xl rounded-[22px] border border-white/8 bg-[#182833] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="text-xl font-semibold text-[#f5f0e3]">Ajouter un familier</h3>
          <p class="mt-1 text-sm text-[#9aa8a2]">Choisis un familier nourrissable pour commencer son suivi.</p>
        </div>
        <button
          type="button"
          class="rounded-[12px] border border-white/8 bg-[#213742] px-3 py-2 text-sm text-stone-200 cursor-pointer"
          @click="closeModal"
        >
          Fermer
        </button>
      </div>

      <form class="mt-5" @submit.prevent="submitModal">
        <div class="grid gap-3 md:grid-cols-2">
          <label class="grid gap-2 md:col-span-2">
            <span class="text-sm text-stone-300/80">Rechercher un familier</span>
            <input
              v-model="query"
              class="w-full rounded-2xl border border-white/8 bg-[#16262f] px-4 py-3 text-sm text-white outline-none placeholder:text-stone-500 focus:border-[#a7d246]/45"
              placeholder="Nom du familier"
            >
          </label>
          <label class="grid gap-2">
            <span class="text-sm text-stone-300/80">Serveur</span>
            <input
              v-model="serverName"
              list="retro-familiar-server-suggestions"
              class="w-full rounded-2xl border border-white/8 bg-[#16262f] px-4 py-3 text-sm text-white outline-none placeholder:text-stone-500 focus:border-[#a7d246]/45"
              placeholder="Optionnel"
            >
          </label>
          <label class="grid gap-2">
            <span class="text-sm text-stone-300/80">Personnage</span>
            <input
              v-model="characterName"
              list="retro-familiar-character-suggestions"
              class="w-full rounded-2xl border border-white/8 bg-[#16262f] px-4 py-3 text-sm text-white outline-none placeholder:text-stone-500 focus:border-[#a7d246]/45"
              placeholder="Optionnel"
            >
          </label>
        </div>

        <div class="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
          <button
            v-for="item in filteredItems"
            :key="item.key"
            type="button"
            class="flex w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-left transition cursor-pointer"
            :class="selectedKey === item.key ? 'border-[#4f6b38] bg-[#1b2b23]' : 'border-white/6 bg-[#101a20] hover:border-white/12 hover:bg-[#132027]'"
            @click="selectedKey = item.key"
          >
            <img
              v-if="item.imageName"
              :src="imageUrl(item)"
              :alt="item.name"
              class="h-12 w-12 shrink-0 rounded-[14px] border border-white/8 bg-[#0d171c] object-contain p-2"
            >
            <div
              v-else
              class="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-white/8 bg-[#0d171c] text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7f8c86]"
            >
              Fam
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-[#f5f0e3]">{{ item.name }}</div>
              <div class="mt-1 text-xs text-[#98a59e]">
                Nourriture : {{ item.foods.join(", ") }}
              </div>
            </div>
          </button>
          <div v-if="!filteredItems.length" class="rounded-[18px] border border-dashed border-white/8 bg-[#101a20] px-4 py-6 text-center text-sm text-[#8d9a94]">
            Aucun familier ne correspond.
          </div>
        </div>

        <footer class="mt-5 flex justify-end">
          <button class="rounded-2xl primary-btn px-4 py-3 text-sm font-semibold text-[#182311] cursor-pointer" type="submit">Ajouter</button>
        </footer>
      </form>
    </div>
  </div>
  <datalist id="retro-familiar-server-suggestions">
    <option v-for="server in serverSuggestions" :key="server" :value="server" />
  </datalist>
  <datalist id="retro-familiar-character-suggestions">
    <option v-for="character in characterSuggestions" :key="character" :value="character" />
  </datalist>
</template>
