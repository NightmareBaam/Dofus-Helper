<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import RetroFamiliarAddModal from "../components/familiars/RetroFamiliarAddModal.vue";
import RetroFamiliarDetailsContent from "../components/familiars/RetroFamiliarDetailsContent.vue";
import RetroFamiliarDetailsModal from "../components/familiars/RetroFamiliarDetailsModal.vue";
import RetroFamiliarEditModal from "../components/familiars/RetroFamiliarEditModal.vue";
import ToastStack from "../components/ui/ToastStack.vue";
import {
  backendClient,
  buildBackendUrl,
  type CharacterWindow,
  type RetroFamiliarEntry,
  type RetroFamiliarItem,
  type RetroFamiliarsPayload,
} from "../services/backendClient";

type SectionId = "manager" | "encyclopedia" | "information";

const emit = defineEmits<{
  (event: "update-due-count", count: number): void;
}>();

const entries = ref<RetroFamiliarEntry[]>([]);
const encyclopedia = ref<RetroFamiliarItem[]>([]);
const knownServers = ref<string[]>([]);
const retroCharacters = ref<string[]>([]);
const loading = ref(true);
const busy = ref(false);
const showAddModal = ref(false);
const selectedEntryId = ref("");
const selectedEditEntryId = ref("");
const statusMessage = ref("");
const errorMessage = ref("");
const activeSection = ref<SectionId>("manager");
const encyclopediaQuery = ref("");
const selectedFamiliarKey = ref("");
const selectedServerFilter = ref("all");
const selectedCharacterFilter = ref("all");
const feedMode = ref(false);
const hiddenFedEntryIds = ref<string[]>([]);

const serverOptions = computed(() => knownServers.value);
const characterOptions = computed(() => [...new Set([
  ...retroCharacters.value,
  ...entries.value.map((entry) => entry.characterName).filter((value): value is string => Boolean(value)),
])].sort((left, right) => left.localeCompare(right, "fr", { sensitivity: "base" })));
const filteredManagerEntries = computed(() => entries.value.filter((entry) => {
  if (selectedServerFilter.value !== "all" && entry.serverName !== selectedServerFilter.value) {
    return false;
  }
  if (selectedCharacterFilter.value !== "all" && entry.characterName !== selectedCharacterFilter.value) {
    return false;
  }
  if (feedMode.value && hiddenFedEntryIds.value.includes(entry.id)) {
    return false;
  }
  return true;
}));
const filteredEncyclopedia = computed(() => {
  const normalizedQuery = encyclopediaQuery.value.trim().toLowerCase();
  if (!normalizedQuery) {
    return encyclopedia.value;
  }
  return encyclopedia.value.filter((item) => item.name.toLowerCase().includes(normalizedQuery) || item.foods.some((food) => food.toLowerCase().includes(normalizedQuery)));
});
const feedableEncyclopedia = computed(() => encyclopedia.value.filter((item) => item.feedable));
const selectedFamiliar = computed(() => {
  return filteredEncyclopedia.value.find((item) => item.key === selectedFamiliarKey.value)
    ?? encyclopedia.value.find((item) => item.key === selectedFamiliarKey.value)
    ?? filteredEncyclopedia.value[0]
    ?? encyclopedia.value[0]
    ?? null;
});
const selectedEntry = computed(() => entries.value.find((entry) => entry.id === selectedEntryId.value) ?? null);
const selectedEditEntry = computed(() => entries.value.find((entry) => entry.id === selectedEditEntryId.value) ?? null);
function applyPayload(payload: RetroFamiliarsPayload): void {
  entries.value = payload.entries;
  encyclopedia.value = payload.encyclopedia;
  knownServers.value = payload.knownServers;
  hiddenFedEntryIds.value = hiddenFedEntryIds.value.filter((entryId) => payload.entries.some((entry) => entry.id === entryId));
  emit("update-due-count", payload.dueCount);
  if (!selectedFamiliarKey.value || !payload.encyclopedia.some((item) => item.key === selectedFamiliarKey.value)) {
    selectedFamiliarKey.value = payload.encyclopedia[0]?.key ?? "";
  }
  if (selectedServerFilter.value !== "all" && !payload.knownServers.includes(selectedServerFilter.value)) {
    selectedServerFilter.value = "all";
  }
  if (selectedCharacterFilter.value !== "all" && !characterOptions.value.includes(selectedCharacterFilter.value)) {
    selectedCharacterFilter.value = "all";
  }
  if (selectedEntryId.value && !payload.entries.some((entry) => entry.id === selectedEntryId.value)) {
    selectedEntryId.value = "";
  }
  if (selectedEditEntryId.value && !payload.entries.some((entry) => entry.id === selectedEditEntryId.value)) {
    selectedEditEntryId.value = "";
  }
}

function imageUrl(item: RetroFamiliarItem): string {
  return item.imageName ? buildBackendUrl(`/api/familiars/retro/images/${encodeURIComponent(item.imageName)}`) : "";
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
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function characterServerLabel(entry: RetroFamiliarEntry): string {
  const values = [entry.characterName, entry.serverName].filter((value): value is string => Boolean(value));
  return values.length ? values.join(" - ") : "Aucun personnage / serveur";
}

async function loadRetroCharacters(): Promise<void> {
  try {
    const snapshot = await backendClient.getRuntimeSnapshot();
    retroCharacters.value = snapshot.charactersPayload.windows
      .filter((window: CharacterWindow) => window.gameType === "retro")
      .map((window: CharacterWindow) => window.pseudo)
      .filter((value, index, values) => values.indexOf(value) === index)
      .sort((left, right) => left.localeCompare(right, "fr", { sensitivity: "base" }));
  } catch {
    retroCharacters.value = [];
  }
}

async function loadRetroFamiliars(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    const [payload] = await Promise.all([
      backendClient.listRetroFamiliars(),
      loadRetroCharacters(),
    ]);
    applyPayload(payload);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Impossible de charger les familiers.";
    emit("update-due-count", 0);
  } finally {
    loading.value = false;
  }
}

async function runAction(action: () => Promise<RetroFamiliarsPayload>, successMessage: string): Promise<void> {
  busy.value = true;
  statusMessage.value = "";
  errorMessage.value = "";
  try {
    const payload = await action();
    applyPayload(payload);
    if (!payload.ok) {
      errorMessage.value = payload.message ?? "Operation impossible.";
      return;
    }
    statusMessage.value = payload.message ?? successMessage;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Operation impossible.";
  } finally {
    busy.value = false;
  }
}

async function addFamiliar(payload: { familiarKey: string; serverName: string; characterName: string }): Promise<void> {
  await runAction(
    () => backendClient.addRetroFamiliar(payload.familiarKey, payload.serverName || null, payload.characterName || null),
    "Familier ajoute.",
  );
  showAddModal.value = false;
  activeSection.value = "manager";
}

async function feedEntry(entryId: string): Promise<void> {
  const previousIds = [...hiddenFedEntryIds.value];
  await runAction(() => backendClient.feedRetroFamiliar(entryId), "Repas enregistre.");
  if (!errorMessage.value) {
    hiddenFedEntryIds.value = [...new Set([...previousIds, entryId])];
  }
}

async function updateEntry(payload: { entryId: string; serverName: string; characterName: string }): Promise<void> {
  await runAction(
    () => backendClient.updateRetroFamiliar(payload.entryId, {
      serverName: payload.serverName || null,
      characterName: payload.characterName || null,
    }),
    "Informations mises a jour.",
  );
  selectedEditEntryId.value = "";
}

async function deleteEntry(entryId: string): Promise<void> {
  await runAction(() => backendClient.deleteRetroFamiliar(entryId), "Familier supprime.");
  selectedEntryId.value = "";
  selectedEditEntryId.value = "";
}

async function handleEntryClick(entry: RetroFamiliarEntry): Promise<void> {
  if (feedMode.value) {
    await feedEntry(entry.id);
    return;
  }
  selectedEntryId.value = entry.id;
}

function toggleFeedMode(): void {
  feedMode.value = !feedMode.value;
  if (!feedMode.value) {
    hiddenFedEntryIds.value = [];
  }
}

function openEntryEdit(entryId: string): void {
  selectedEditEntryId.value = entryId;
}

function entryCardClass(entry: RetroFamiliarEntry): string {
  if (entry.status.overdue) {
    return "border-rose-300/20 bg-[linear-gradient(180deg,rgba(72,19,29,0.96),rgba(12,23,29,0.98))] hover:border-rose-300/35";
  }
  if (entry.status.canFeed) {
    return "border-[#5a7b3f] bg-[linear-gradient(180deg,rgba(31,50,22,0.96),rgba(12,23,29,0.98))] hover:border-[#7aa752]";
  }
  return "border-white/8 bg-[#0c171d]/95 hover:border-white/14 hover:bg-[#101a20]";
}

onMounted(() => {
  void loadRetroFamiliars();
});
</script>

<template>
  <section class="space-y-4">
    <ToastStack :status-message="statusMessage" :error-message="errorMessage" />

    <div class="rounded-[24px] border border-white/8 bg-[#0c171d]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.22)]">
      <div class="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          class="rounded-[16px] border px-4 py-2.5 text-sm font-semibold transition cursor-pointer"
          :class="activeSection === 'manager' ? 'border-[#4f6b38] bg-[#1b2b23] text-[#f3f1e7]' : 'border-white/8 bg-[#101a20] text-[#ccd5d1] hover:border-white/12'"
          @click="activeSection = 'manager'"
        >
          Mes familiers
        </button>
        <button
          type="button"
          class="rounded-[16px] border px-4 py-2.5 text-sm font-semibold transition cursor-pointer"
          :class="activeSection === 'encyclopedia' ? 'border-[#4f6b38] bg-[#1b2b23] text-[#f3f1e7]' : 'border-white/8 bg-[#101a20] text-[#ccd5d1] hover:border-white/12'"
          @click="activeSection = 'encyclopedia'"
        >
          Encyclopedie
        </button>
        <button
          type="button"
          class="rounded-[16px] border px-4 py-2.5 text-sm font-semibold transition cursor-pointer"
          :class="activeSection === 'information' ? 'border-[#4f6b38] bg-[#1b2b23] text-[#f3f1e7]' : 'border-white/8 bg-[#101a20] text-[#ccd5d1] hover:border-white/12'"
          @click="activeSection = 'information'"
        >
          Informations
        </button>
      </div>
    </div>

    <div v-if="loading" class="rounded-[24px] border border-white/8 bg-[#0c171d]/95 px-5 py-10 text-center text-sm text-[#93a09a]">
      Chargement des familiers...
    </div>

    <template v-else-if="activeSection === 'manager'">
      <div class="rounded-[24px] border border-white/8 bg-[#0c171d]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div class="grid gap-3 md:grid-cols-2 xl:min-w-[460px] xl:flex-1">
            <label class="grid gap-2">
              <span class="text-sm font-medium text-[#f5f0e3]">Serveur</span>
              <select
                v-model="selectedServerFilter"
                class="w-full rounded-2xl border border-white/8 bg-[#101a20] px-4 py-3 text-sm text-white outline-none focus:border-[#a7d246]/45"
              >
                <option value="all">Tous les serveurs</option>
                <option v-for="server in serverOptions" :key="server" :value="server">{{ server }}</option>
              </select>
            </label>
            <label class="grid gap-2">
              <span class="text-sm font-medium text-[#f5f0e3]">Personnage</span>
              <select
                v-model="selectedCharacterFilter"
                class="w-full rounded-2xl border border-white/8 bg-[#101a20] px-4 py-3 text-sm text-white outline-none focus:border-[#a7d246]/45"
              >
                <option value="all">Tous les personnages</option>
                <option v-for="character in characterOptions" :key="character" :value="character">{{ character }}</option>
              </select>
            </label>
          </div>

          <div class="flex flex-wrap items-center gap-2 xl:justify-end">
            <button
              type="button"
              class="rounded-2xl secondary-btn px-4 py-3 text-sm"
              :class="feedMode ? 'border-[#8dbd56] text-[#f4f9ea]' : ''"
              @click="toggleFeedMode"
            >
              Nourrir
            </button>
            <button type="button" class="rounded-2xl primary-btn px-4 py-3 text-sm font-semibold text-[#182311] cursor-pointer" @click="showAddModal = true">
              Ajouter un familier
            </button>
          </div>
        </div>
      </div>

      <div v-if="feedMode" class="rounded-[20px] border border-[#5a7b3f] bg-[#25331f] px-4 py-3 text-sm text-[#dff2a5] shadow-[0_20px_60px_rgba(0,0,0,0.16)]">
        Mode nourrir actif : clique sur un familier pour enregistrer son dernier repas.
      </div>

      <div
        v-if="!filteredManagerEntries.length"
        class="rounded-[24px] border border-dashed border-white/10 bg-[#0c171d]/95 px-5 py-10 text-center text-sm text-[#93a09a]"
      >
        {{ feedMode && hiddenFedEntryIds.length ? "Tous les familiers visibles ont ete nourris." : "Aucun familier ne correspond aux filtres." }}
      </div>

      <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article
          v-for="entry in filteredManagerEntries"
          :key="entry.id"
          class="group relative rounded-[24px] border p-4 text-left shadow-[0_20px_60px_rgba(0,0,0,0.2)] transition"
          :class="entryCardClass(entry)"
        >
          <button
            v-if="!feedMode"
            type="button"
            class="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-[14px] border border-[#44593c] bg-[#2a3825] text-[#dff2a5] transition hover:border-[#5d774b] cursor-pointer"
            @click="openEntryEdit(entry.id)"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" class="h-4 w-4 fill-none stroke-current" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 20l4.2-1 9.1-9.1-3.2-3.2L5 15.8 4 20z" />
              <path d="M13.9 6.7l3.2 3.2" />
            </svg>
          </button>

          <button
            type="button"
            class="w-full cursor-pointer text-left"
            @click="handleEntryClick(entry)"
          >
            <div class="grid gap-4">
              <div class="grid grid-cols-[84px_minmax(0,1fr)] gap-4">
                <div class="flex items-start">
                  <img
                    v-if="entry.familiar.imageName"
                    :src="imageUrl(entry.familiar)"
                    :alt="entry.familiar.name"
                    class="h-20 w-20 shrink-0 rounded-[16px] border border-white/8 bg-[#101a20] object-contain p-3"
                  >
                  <div
                    v-else
                    class="flex h-20 w-20 shrink-0 items-center justify-center rounded-[16px] border border-white/8 bg-[#101a20] text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7f8c86]"
                  >
                    Fam
                  </div>
                </div>

                <div class="min-w-0 pr-10">
                  <h2 class="truncate text-lg font-semibold text-[#f5f0e3]">{{ entry.familiar.name }}</h2>
                  <p class="mt-1 truncate text-sm text-[#bdc8c3]">{{ characterServerLabel(entry) }}</p>

                  <div class="mt-4 text-sm text-[#cad3cf]">
                    <div>Dernier repas : <span class="font-medium text-[#f1ede3]">{{ formatDate(entry.lastFedAt) }}</span></div>
                  </div>
                </div>
              </div>

              <div class="h-[2px] w-full rounded-full bg-[#f3f1e7]"></div>

              <div class="flex items-center justify-between gap-4 text-sm text-[#cad3cf]">
                <div>Prochain repas a partir de</div>
                <div class="shrink-0 text-base font-semibold text-[#f5f0e3]">{{ formatDate(entry.status.nextFeedAt) }}</div>
              </div>
            </div>
          </button>

          <div v-if="feedMode" class="mt-4 rounded-[16px] border border-[#6f9548] bg-[#2d4121] px-3 py-2 text-center text-sm font-semibold text-[#e5f3ba]">
            Cliquer pour nourrir
          </div>
        </article>
      </div>
    </template>

    <div v-else-if="activeSection === 'encyclopedia'" class="grid gap-4 xl:h-[calc(100vh-150px)] xl:min-h-0 xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside class="rounded-[24px] border border-white/8 bg-[#0c171d]/95 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.2)] xl:min-h-0 xl:overflow-hidden">
        <label class="grid gap-2">
          <span class="text-sm font-medium text-[#f5f0e3]">Rechercher</span>
          <input
            v-model="encyclopediaQuery"
            class="w-full rounded-2xl border border-white/8 bg-[#101a20] px-4 py-3 text-sm text-white outline-none placeholder:text-stone-500 focus:border-[#a7d246]/45"
            placeholder="Nom ou nourriture"
          >
        </label>

        <div class="mt-4 space-y-2 overflow-y-auto pr-1 xl:max-h-[calc(100vh-250px)]">
          <button
            v-for="item in filteredEncyclopedia"
            :key="item.key"
            type="button"
            class="flex w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-left transition cursor-pointer"
            :class="selectedFamiliar?.key === item.key ? 'border-[#4f6b38] bg-[#1b2b23]' : 'border-white/6 bg-[#101a20] hover:border-white/12 hover:bg-[#132027]'"
            @click="selectedFamiliarKey = item.key"
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
              <div class="truncate text-sm font-semibold text-[#f5f0e3]">{{ item.name }}</div>
              <div class="mt-1 truncate text-xs text-[#98a59e]">{{ item.foods.join(", ") }}</div>
            </div>
          </button>
        </div>
      </aside>

      <section v-if="selectedFamiliar" class="rounded-[24px] border border-white/8 bg-[#0c171d]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)] xl:min-h-0 xl:overflow-y-auto">
        <RetroFamiliarDetailsContent :item="selectedFamiliar" />
      </section>
    </div>

    <div
      v-else-if="false"
      class="rounded-[24px] border border-white/8 bg-[#0c171d]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
    >
      <div v-if="false" class="grid gap-4 lg:grid-cols-2">
        <article class="rounded-[20px] border border-white/8 bg-[#101a20] p-4">
          <div class="text-sm font-semibold text-[#f5f0e3]">Rythme des repas</div>
          <p class="mt-2 text-sm text-[#b8c4be]">
            Un familier devient nourrissable a partir du debut de sa fenetre de repas. S’il depasse la fin de cette fenetre, il passe en retard.
          </p>
        </article>
        <article class="rounded-[20px] border border-white/8 bg-[#101a20] p-4">
          <div class="text-sm font-semibold text-[#f5f0e3]">Mode nourrir</div>
          <p class="mt-2 text-sm text-[#b8c4be]">
            Active `Nourrir`, puis clique directement sur les cartes pour enregistrer rapidement le dernier repas sans ouvrir la fiche detail.
          </p>
        </article>
        <article class="rounded-[20px] border border-white/8 bg-[#101a20] p-4">
          <div class="text-sm font-semibold text-[#f5f0e3]">Serveur et personnage</div>
          <p class="mt-2 text-sm text-[#b8c4be]">
            Ces deux champs sont optionnels. Les personnages Retro detectes sont proposes, et les serveurs deja saisis restent disponibles en suggestion.
          </p>
        </article>
      </div>
    </div>

    <div
      v-if="activeSection === 'information'"
      class="rounded-[24px] border border-white/8 bg-[#0c171d]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
    >
      <div class="grid gap-4 lg:grid-cols-2">
        <article class="rounded-[20px] border border-white/8 bg-[#101a20] p-4">
          <div class="text-sm font-semibold text-[#f5f0e3]">Rythme des repas</div>
          <div class="mt-3 space-y-2 text-sm text-[#b8c4be]">
            <p><span class="font-semibold text-[#dff2a5]">Trop tot</span> : le familier devient obese.</p>
            <p><span class="font-semibold text-rose-200">Trop tard</span> : il devient maigrichon et il faut rattraper les repas manques.</p>
            <p><span class="font-semibold text-[#f5f0e3]">Meme au maximum</span>, il doit continuer a etre nourri.</p>
          </div>
        </article>

        <article class="rounded-[20px] border border-white/8 bg-[#101a20] p-4">
          <div class="text-sm font-semibold text-[#f5f0e3]">Boost</div>
          <div class="mt-3 space-y-2 text-sm text-[#b8c4be]">
            <p><span class="text-lg font-bold text-[#dff2a5]">3 repas = 1 point de boost</span></p>
            <p>Le bonus gagne depend du <span class="font-semibold text-[#f5f0e3]">3e repas</span>.</p>
            <p>Donner la bonne ressource seulement tous les 3 repas peut etre rentable sur certains familiers.</p>
          </div>
        </article>

        <article class="rounded-[20px] border border-white/8 bg-[#101a20] p-4">
          <div class="text-sm font-semibold text-[#f5f0e3]">Capital de bonus</div>
          <div class="mt-3 rounded-[14px] border border-[#4d6840] bg-[#1d2d23] px-3 py-2 text-sm font-semibold text-[#dff2a5]">
            Capital standard : 80 points de bonus
          </div>
          <div class="mt-3 space-y-2 text-sm">
            <div class="rounded-[14px] border border-white/6 bg-[#152028] px-3 py-2 text-[#b8c4be] whitespace-nowrap"><span class="font-semibold text-[#f5f0e3]">1 Int / For / Agi / Cha / Vita</span> = <span class="font-semibold text-[#dff2a5]">1 pt</span> <span class="ml-2 text-[#8fa19a]">max 80</span></div>
            <div class="rounded-[14px] border border-white/6 bg-[#152028] px-3 py-2 text-[#b8c4be] whitespace-nowrap"><span class="font-semibold text-[#f5f0e3]">1 Prospection</span> = <span class="font-semibold text-[#dff2a5]">1 pt</span> <span class="ml-2 text-[#8fa19a]">max 80</span></div>
            <div class="rounded-[14px] border border-white/6 bg-[#152028] px-3 py-2 text-[#b8c4be] whitespace-nowrap"><span class="font-semibold text-[#f5f0e3]">1 Sagesse</span> = <span class="font-semibold text-[#dff2a5]">3 pts</span> <span class="ml-2 text-[#8fa19a]">max 26</span></div>
            <div class="rounded-[14px] border border-white/6 bg-[#152028] px-3 py-2 text-[#b8c4be] whitespace-nowrap"><span class="font-semibold text-[#f5f0e3]">1% Resistance</span> = <span class="font-semibold text-[#dff2a5]">4 pts</span> <span class="ml-2 text-[#8fa19a]">max 20</span></div>
            <div class="rounded-[14px] border border-white/6 bg-[#152028] px-3 py-2 text-[#b8c4be] whitespace-nowrap"><span class="font-semibold text-[#f5f0e3]">1% Dommage</span> = <span class="font-semibold text-[#dff2a5]">2 pts</span> <span class="ml-2 text-[#8fa19a]">max 40</span></div>
            <div class="rounded-[14px] border border-white/6 bg-[#152028] px-3 py-2 text-[#b8c4be] whitespace-nowrap"><span class="font-semibold text-[#f5f0e3]">1 Soin / + dommage</span> = <span class="font-semibold text-[#dff2a5]">8 pts</span> <span class="ml-2 text-[#8fa19a]">max 10</span></div>
          </div>
        </article>

        <article class="rounded-[20px] border border-white/8 bg-[#101a20] p-4">
          <div class="text-sm font-semibold text-[#f5f0e3]">Soins et resurrection</div>
          <div class="mt-3 space-y-2 text-sm text-[#b8c4be]">
            <p><span class="font-semibold text-[#f5f0e3]">Oshimo [9,21]</span> : <span class="font-semibold text-[#dff2a5]">1 000 kamas = 1 PV</span>.</p>
            <p><span class="font-semibold text-[#f5f0e3]">Oshimo</span> ressuscite sans bonus avec une poudre d’Eniripsa.</p>
            <p><span class="font-semibold text-[#f5f0e3]">Doro le Black</span>, au <span class="font-semibold text-[#f5f0e3]">Temple Xelor</span>, ressuscite avec les bonus.</p>
          </div>
        </article>

        <article class="rounded-[20px] border border-white/8 bg-[#101a20] p-4 lg:col-span-2">
          <div class="text-sm font-semibold text-[#f5f0e3]">Capacites accrues</div>
          <div class="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div class="space-y-4">
              <div class="space-y-2 text-sm text-[#b8c4be]">
                <p><span class="font-semibold text-[#dff2a5]">Jusqu’a +10%</span> du maximum normal sur certains familiers.</p>
                <p>Les familiers qui ne mangent ni ressource ni ame n’ont pas de capacites accrues.</p>
                <p>Familiers d’abonnement standards : <span class="font-semibold text-[#f5f0e3]">cachet d’Eupeoh</span>. Les autres : <span class="font-semibold text-[#f5f0e3]">potion d’alchimiste</span>.</p>
              </div>

              <div class="rounded-[16px] border border-white/6 bg-[#152028] p-4">
                <div class="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#dff2a5]">Recette de la potion</div>
                <div class="grid gap-2 text-sm text-[#b8c4be] sm:grid-cols-2">
                  <div><span class="font-semibold text-[#f5f0e3]">100x</span> Boulette d’insecte</div>
                  <div><span class="font-semibold text-[#f5f0e3]">100x</span> Sardine a l’huile</div>
                  <div><span class="font-semibold text-[#f5f0e3]">25x</span> Pain Thade</div>
                  <div><span class="font-semibold text-[#f5f0e3]">5x</span> Planche en bambou</div>
                  <div><span class="font-semibold text-[#f5f0e3]">5x</span> Kouartz</div>
                  <div><span class="font-semibold text-[#f5f0e3]">1x</span> Hormone du familier</div>
                  <div><span class="font-semibold text-[#f5f0e3]">1x</span> Nacre</div>
                  <div><span class="font-semibold text-[#f5f0e3]">1x</span> Poudre de Creatoune</div>
                </div>
              </div>
            </div>

            <div class="rounded-[16px] border border-[#4d6840] bg-[#1d2d23] p-4 text-sm text-[#dff2a5]">
              <div class="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#dff2a5]">A retenir</div>
              <p>La poudre de Creatoune vient du donjon familier.</p>
              <p class="mt-2">L’hormone depend du familier et se drop sur un monstre precis.</p>
            </div>
          </div>
        </article>

      </div>
    </div>

    <RetroFamiliarAddModal
      :open="showAddModal"
      :items="feedableEncyclopedia"
      :server-suggestions="serverOptions"
      :character-suggestions="characterOptions"
      @close="showAddModal = false"
      @submit="addFamiliar"
    />

    <RetroFamiliarDetailsModal
      :open="Boolean(selectedEntry)"
      :entry="selectedEntry"
      @close="selectedEntryId = ''"
    />

    <RetroFamiliarEditModal
      :open="Boolean(selectedEditEntry)"
      :entry="selectedEditEntry"
      :server-suggestions="serverOptions"
      :character-suggestions="characterOptions"
      @close="selectedEditEntryId = ''"
      @save="updateEntry"
      @delete="deleteEntry"
    />
  </section>
</template>
