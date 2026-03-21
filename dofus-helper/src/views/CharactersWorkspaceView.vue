<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import combatOffUrl from "../assets/combat.png";
import combatOnUrl from "../assets/combat_actif.png";
import echangeOffUrl from "../assets/echange.png";
import echangeOnUrl from "../assets/echange_actif.png";
import groupeOffUrl from "../assets/groupe.png";
import groupeOnUrl from "../assets/groupe_actif.png";
import mpOffUrl from "../assets/mp.png";
import mpOnUrl from "../assets/mp_actif.png";
import AutofocusLogPanel from "../components/characters/AutofocusLogPanel.vue";
import CharactersToolbar from "../components/characters/CharactersToolbar.vue";
import CharacterWindowCard from "../components/characters/CharacterWindowCard.vue";
import ToastStack from "../components/ui/ToastStack.vue";
import {
  backendClient,
  type AutofocusLogEntry,
  type AutofocusState,
  type CharacterNotifType,
  type CharacterWindow,
  type CharactersConfig,
  type CharactersPayload,
} from "../services/backendClient";
import { shortcutFromKeyboardEvent, shortcutFromMouseEvent } from "../services/shortcutCapture";

const FALLBACK_TYPES: CharacterNotifType[] = ["combat", "echange", "groupe", "mp"];
const props = defineProps<{
  compactMode: boolean;
}>();

const emit = defineEmits<{
  (event: "toggle-compact"): void;
}>();

const typeMeta: Record<CharacterNotifType, { label: string; accent: string; iconOn: string; iconOff: string }> = {
  combat: { label: "Combat", accent: "bg-emerald-500/12 text-emerald-50 border-emerald-300/20", iconOn: combatOnUrl, iconOff: combatOffUrl },
  echange: { label: "Echange", accent: "bg-amber-500/12 text-amber-50 border-amber-300/20", iconOn: echangeOnUrl, iconOff: echangeOffUrl },
  groupe: { label: "Groupe", accent: "bg-sky-500/12 text-sky-50 border-sky-300/20", iconOn: groupeOnUrl, iconOff: groupeOffUrl },
  mp: { label: "MP", accent: "bg-fuchsia-500/12 text-fuchsia-50 border-fuchsia-300/20", iconOn: mpOnUrl, iconOff: mpOffUrl },
};

const windows = ref<CharacterWindow[]>([]);
const config = ref<CharactersConfig>({ enableRetro: true, enableUnity: true, copyMpSender: true, order: [], rules: {} });
const availableTypes = ref<CharacterNotifType[]>([...FALLBACK_TYPES]);
const autofocusState = ref<AutofocusState>({
  available: true,
  running: false,
  debugEnabled: false,
  enabledTypes: { combat: true, echange: true, groupe: true, mp: true },
  stats: { notifications: "0", matches: "0", focus: "0", last: "-" },
  accessStatus: "Unknown",
  logs: [],
});
const autofocusLogs = ref<AutofocusLogEntry[]>([]);
const showLogs = ref(false);
const loading = ref(true);
const busy = ref(false);
const errorMessage = ref("");
const statusMessage = ref("");
const capturePseudo = ref<string | null>(null);
const draggedHwnd = ref<number | null>(null);
const dragOverHwnd = ref<number | null>(null);
let pollHandle: number | null = null;
let lastCharactersRevision = 0;
let lastAutofocusLogId = 0;

function applyPayload(payload: CharactersPayload): void {
  windows.value = payload.windows;
  config.value = payload.config;
  availableTypes.value = payload.availableTypes?.length ? payload.availableTypes : [...FALLBACK_TYPES];
}

function applyAutofocusState(nextState: AutofocusState): void {
  autofocusState.value = nextState;
  if (Array.isArray(nextState.logs)) {
    autofocusLogs.value = nextState.logs;
    lastAutofocusLogId = nextState.logs.length ? nextState.logs[nextState.logs.length - 1].id : 0;
  }
}

function appendAutofocusLogs(entries: AutofocusLogEntry[]): void {
  if (!entries.length) {
    return;
  }
  autofocusLogs.value = [...autofocusLogs.value, ...entries].slice(-180);
  lastAutofocusLogId = autofocusLogs.value.length ? autofocusLogs.value[autofocusLogs.value.length - 1].id : lastAutofocusLogId;
}

function applyRuntimeSnapshot(payload: { charactersRevision: number; charactersPayload: CharactersPayload; autofocusState: AutofocusState }): void {
  lastCharactersRevision = payload.charactersRevision;
  applyPayload(payload.charactersPayload);
  applyAutofocusState(payload.autofocusState);
}

async function initialize(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    const snapshot = await backendClient.getRuntimeSnapshot();
    applyRuntimeSnapshot(snapshot);
    if (snapshot.autofocusState.debugEnabled) {
      applyAutofocusState((await backendClient.setAutofocusDebug(false)).autofocusState);
    }
    startRuntimePolling();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Impossible de charger les personnages.";
  } finally {
    loading.value = false;
  }
}

async function runAction(action: () => Promise<CharactersPayload>, successMessage: string): Promise<void> {
  busy.value = true;
  errorMessage.value = "";
  statusMessage.value = "";
  try {
    const payload = await action();
    applyPayload(payload);
    if (!payload.ok) {
      errorMessage.value = payload.message ?? "Operation impossible.";
      return;
    }
    statusMessage.value = successMessage;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Operation impossible.";
  } finally {
    busy.value = false;
  }
}

async function refreshCharacters(): Promise<void> {
  await runAction(() => backendClient.refreshCharacters(), "Liste actualisee.");
}

async function setFilter(gameType: "retro" | "unity", enabled: boolean): Promise<void> {
  await runAction(() => backendClient.setCharacterFilter(gameType, enabled), `Filtre ${gameType} mis a jour.`);
}

async function setCopyMpSender(enabled: boolean): Promise<void> {
  await runAction(() => backendClient.setCopyMpSender(enabled), `Copie MP ${enabled ? "activee" : "desactivee"}.`);
}

async function saveWindowOrder(orderedHwnds: number[], message: string): Promise<void> {
  await runAction(() => backendClient.saveCharacterOrder(orderedHwnds), message);
}

async function toggleRotation(window: CharacterWindow): Promise<void> {
  busy.value = true;
  errorMessage.value = "";
  statusMessage.value = "";
  try {
    const payload = await backendClient.setCharacterRotation(window.pseudo, !window.rotationEnabled);
    config.value = payload.config;
    windows.value = windows.value.map((item) => item.hwnd === window.hwnd ? { ...item, rule: payload.rule, rotationEnabled: payload.rule.rotation !== false } : item);
    statusMessage.value = payload.rule.rotation ? "Personnage reintegre au roulement." : "Personnage exclu du roulement.";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Operation impossible.";
  } finally {
    busy.value = false;
  }
}

async function toggleRule(window: CharacterWindow, notifType: CharacterNotifType): Promise<void> {
  const next = !(window.rule[notifType] !== false);
  busy.value = true;
  errorMessage.value = "";
  statusMessage.value = "";
  try {
    const payload = await backendClient.setCharacterRule(window.pseudo, notifType, next);
    if (!payload.ok) {
      errorMessage.value = payload.message ?? "Operation impossible.";
      return;
    }
    config.value = payload.config;
    windows.value = windows.value.map((item) => item.hwnd === window.hwnd ? { ...item, rule: payload.rule, rotationEnabled: payload.rule.rotation !== false } : item);
    statusMessage.value = `${typeMeta[notifType].label} ${next ? "active" : "desactive"} pour ${window.pseudo}.`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Operation impossible.";
  } finally {
    busy.value = false;
  }
}

async function setAllRules(notifType: CharacterNotifType, enabled: boolean): Promise<void> {
  await runAction(() => backendClient.setAllCharacterRules(notifType, enabled), `${typeMeta[notifType].label} ${enabled ? "active" : "desactive"} pour tous les personnages.`);
}

async function focusWindow(hwnd: number): Promise<void> {
  busy.value = true;
  errorMessage.value = "";
  statusMessage.value = "";
  try {
    const payload = await backendClient.focusCharacterWindow(hwnd);
    if (!payload.ok) {
      errorMessage.value = payload.message;
      return;
    }
    statusMessage.value = payload.message;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Impossible de focaliser la fenetre.";
  } finally {
    busy.value = false;
  }
}

async function setCharacterShortcut(pseudo: string, value: string | null): Promise<void> {
  await runAction(() => backendClient.setCharacterShortcut(pseudo, value), value ? `Raccourci de ${pseudo} mis a jour.` : `Raccourci de ${pseudo} supprime.`);
}

function beginCharacterShortcutCapture(window: CharacterWindow): void {
  if (capturePseudo.value === window.pseudo) {
    stopCharacterShortcutCapture();
    return;
  }
  capturePseudo.value = window.pseudo;
  document.addEventListener("keydown", onCharacterShortcutKeydown, true);
  document.addEventListener("mousedown", onCharacterShortcutMousedown, true);
  document.addEventListener("contextmenu", preventCharacterShortcutContextMenu, true);
}

function stopCharacterShortcutCapture(): void {
  if (!capturePseudo.value) {
    return;
  }
  capturePseudo.value = null;
  document.removeEventListener("keydown", onCharacterShortcutKeydown, true);
  document.removeEventListener("mousedown", onCharacterShortcutMousedown, true);
  document.removeEventListener("contextmenu", preventCharacterShortcutContextMenu, true);
}

async function clearCharacterShortcut(window: CharacterWindow): Promise<void> {
  if (capturePseudo.value === window.pseudo) {
    stopCharacterShortcutCapture();
  }
  await setCharacterShortcut(window.pseudo, null);
}

function preventCharacterShortcutContextMenu(event: Event): void {
  if (!capturePseudo.value) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

async function persistCapturedCharacterShortcut(combo: string): Promise<void> {
  const pseudo = capturePseudo.value;
  stopCharacterShortcutCapture();
  if (!pseudo) {
    return;
  }
  await setCharacterShortcut(pseudo, combo);
}

function onCharacterShortcutKeydown(event: KeyboardEvent): void {
  if (!capturePseudo.value) {
    return;
  }
  const combo = shortcutFromKeyboardEvent(event);
  event.preventDefault();
  event.stopPropagation();
  if (combo === null) {
    if (event.key === "Escape") {
      stopCharacterShortcutCapture();
    }
    return;
  }
  void persistCapturedCharacterShortcut(combo);
}

function onCharacterShortcutMousedown(event: MouseEvent): void {
  if (!capturePseudo.value) {
    return;
  }
  const combo = shortcutFromMouseEvent(event);
  event.preventDefault();
  event.stopPropagation();
  if (combo === null) {
    return;
  }
  void persistCapturedCharacterShortcut(combo);
}

function startRuntimePolling(): void {
  stopRuntimePolling();
  pollHandle = window.setInterval(() => {
    void pollRuntime();
  }, 1200);
}

function stopRuntimePolling(): void {
  if (pollHandle !== null) {
    window.clearInterval(pollHandle);
    pollHandle = null;
  }
}

async function pollRuntime(): Promise<void> {
  try {
    const payload = await backendClient.pollRuntime(lastCharactersRevision, lastAutofocusLogId, 0);
    if (payload.charactersPayload) {
      lastCharactersRevision = payload.charactersRevision;
      applyPayload(payload.charactersPayload);
    }
    applyAutofocusState(payload.autofocusState);
    appendAutofocusLogs(payload.autofocusLogs);
  } catch {
    // Silence polling errors.
  }
}

function logTone(tag: string): string {
  if (tag.startsWith("type_")) {
    const notifType = tag.replace("type_", "") as CharacterNotifType;
    return typeMeta[notifType]?.accent ?? "border-white/10 bg-black/16 text-stone-100";
  }
  if (tag === "ok") {
    return "border-emerald-300/20 bg-emerald-500/10 text-emerald-100";
  }
  if (tag === "warn") {
    return "border-amber-300/20 bg-amber-500/10 text-amber-100";
  }
  if (tag === "error") {
    return "border-rose-300/20 bg-rose-500/10 text-rose-100";
  }
  if (tag === "debug") {
    return "border-sky-300/20 bg-sky-500/10 text-sky-100";
  }
  return "border-white/10 bg-black/16 text-stone-300/80";
}

function bulkRuleEnabled(notifType: CharacterNotifType): boolean {
  return windows.value.length > 0 && windows.value.every((window) => window.rule[notifType] !== false);
}

function onDragStart(hwnd: number): void {
  draggedHwnd.value = hwnd;
  dragOverHwnd.value = hwnd;
  document.body.style.userSelect = "none";
  document.body.style.cursor = "grabbing";
}

function onDragEnter(hwnd: number): void {
  if (draggedHwnd.value === null || draggedHwnd.value === hwnd) {
    return;
  }
  dragOverHwnd.value = hwnd;
}

function onDragEnd(): void {
  draggedHwnd.value = null;
  dragOverHwnd.value = null;
  document.body.style.userSelect = "";
  document.body.style.cursor = "";
}

async function onDrop(targetHwnd: number): Promise<void> {
  if (draggedHwnd.value === null || draggedHwnd.value === targetHwnd) {
    onDragEnd();
    return;
  }
  const fromIndex = windows.value.findIndex((window) => window.hwnd === draggedHwnd.value);
  const toIndex = windows.value.findIndex((window) => window.hwnd === targetHwnd);
  onDragEnd();
  if (fromIndex === -1 || toIndex === -1) {
    return;
  }
  const next = [...windows.value];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  await saveWindowOrder(next.map((window) => window.hwnd), "Ordre des fenetres mis a jour.");
}

function onGlobalPointerRelease(): void {
  const target = dragOverHwnd.value;
  if (draggedHwnd.value === null) {
    return;
  }
  if (target !== null && target !== draggedHwnd.value) {
    void onDrop(target);
    return;
  }
  onDragEnd();
}

const visibleTypes = computed(() => availableTypes.value.filter((notifType) => notifType in typeMeta));

watch(
  () => props.compactMode,
  (value) => {
    if (value) {
      showLogs.value = false;
    }
  },
  { immediate: true },
);

onMounted(() => {
  window.addEventListener("pointerup", onGlobalPointerRelease);
  window.addEventListener("pointercancel", onGlobalPointerRelease);
  window.addEventListener("blur", onGlobalPointerRelease);
  void initialize();
});

onUnmounted(() => {
  window.removeEventListener("pointerup", onGlobalPointerRelease);
  window.removeEventListener("pointercancel", onGlobalPointerRelease);
  window.removeEventListener("blur", onGlobalPointerRelease);
  stopRuntimePolling();
  stopCharacterShortcutCapture();
  onDragEnd();
});
</script>

<template>
  <div class="space-y-3" :class="compactMode ? 'mx-auto max-w-[640px]' : ''">
    <CharactersToolbar
      :busy="busy"
      :config="config"
      :visible-types="visibleTypes"
      :type-meta="typeMeta"
      :windows-count="windows.length"
      :show-logs="showLogs"
      :compact-mode="compactMode"
      :is-bulk-enabled="bulkRuleEnabled"
      @refresh="refreshCharacters"
      @set-filter="setFilter"
      @set-copy-mp="setCopyMpSender"
      @toggle-logs="showLogs = !showLogs"
      @toggle-compact="emit('toggle-compact')"
      @set-all-rules="setAllRules"
    />

    <section class="space-y-2" :class="compactMode ? 'space-y-1.5' : ''">
      <div v-if="loading" class="rounded-[18px] border border-white/15 px-6 py-8 text-center text-[13px] text-stone-300/75">
        Detection des fenetres Dofus en cours...
      </div>
      <div v-else-if="!windows.length" class="rounded-[18px] border border-dashed border-white/15 px-6 py-10 text-center text-[13px] text-stone-300/75">
        Aucune fenetre Dofus detectee avec les filtres actifs.
      </div>
      <CharacterWindowCard
        v-for="(window, index) in windows"
        v-else
        :key="window.hwnd"
        :window="window"
        :index="index"
        :busy="busy"
        :compact-mode="compactMode"
        :capture-active="capturePseudo === window.pseudo"
        :visible-types="visibleTypes"
        :type-meta="typeMeta"
        :dragged-hwnd="draggedHwnd"
        :drag-over-hwnd="dragOverHwnd"
        @drag-start="onDragStart"
        @drag-enter="onDragEnter"
        @drag-drop="onDrop"
        @drag-end="onDragEnd"
        @toggle-rule="toggleRule"
        @toggle-rotation="toggleRotation"
        @capture-shortcut="beginCharacterShortcutCapture"
        @clear-shortcut="clearCharacterShortcut"
        @focus="focusWindow"
      />
    </section>

    <AutofocusLogPanel v-if="showLogs && !compactMode" :logs="autofocusLogs" :log-tone="logTone" />
    <ToastStack :status-message="statusMessage" :error-message="errorMessage" />
  </div>
</template>
