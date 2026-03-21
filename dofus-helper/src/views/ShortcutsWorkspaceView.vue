<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import ShortcutActionCard from "../components/shortcuts/ShortcutActionCard.vue";
import ShortcutEventsPanel from "../components/shortcuts/ShortcutEventsPanel.vue";
import ShortcutsToolbar from "../components/shortcuts/ShortcutsToolbar.vue";
import ToastStack from "../components/ui/ToastStack.vue";
import { shortcutFromKeyboardEvent, shortcutFromMouseEvent } from "../services/shortcutCapture";
import {
  backendClient,
  type ShortcutAction,
  type ShortcutDebugEvent,
  type ShortcutsState,
} from "../services/backendClient";

const shortcutMeta: Record<ShortcutAction, { title: string; subtitle: string }> = {
  next: { title: "Fenetre suivante", subtitle: "Passe au personnage suivant dans la rotation." },
  prev: { title: "Fenetre precedente", subtitle: "Revient au personnage precedent dans la rotation." },
  last: { title: "Dernier focus", subtitle: "Revient sur la derniere fenetre Dofus active." },
  refresh: { title: "Actualiser les fenetres", subtitle: "Relance la detection des fenetres du jeu." },
  helper: { title: "Focus Dofus Helper", subtitle: "Ramene la fenetre de l'application au premier plan." },
};

const shortcutsState = ref<ShortcutsState>({
  values: { next: null, prev: null, last: null, refresh: null, helper: null },
  status: { text: "", tone: "muted" },
  debugEnabled: false,
  keyboardAvailable: false,
  mouseAvailable: false,
});
const shortcutEvents = ref<ShortcutDebugEvent[]>([]);
const captureAction = ref<ShortcutAction | null>(null);
const loading = ref(true);
const busy = ref(false);
const errorMessage = ref("");
const statusMessage = ref("");
const showDebug = ref(false);
let pollHandle: number | null = null;
let lastCharactersRevision = 0;
let lastShortcutEventId = 0;

function notifyShortcutState(state: ShortcutsState, fallbackMessage = ""): void {
  const message = state.status.text.trim() || fallbackMessage;
  if (!message) {
    return;
  }
  if (state.status.tone === "danger") {
    errorMessage.value = message;
    statusMessage.value = "";
    return;
  }
  statusMessage.value = message;
  errorMessage.value = "";
}

function shortcutStatusSignature(state: ShortcutsState): string {
  return `${state.status.tone}:${state.status.text}`;
}

function applyState(state: ShortcutsState, notifyOnStatusChange = false): void {
  const previousSignature = shortcutStatusSignature(shortcutsState.value);
  shortcutsState.value = state;
  if (!notifyOnStatusChange) {
    return;
  }
  const nextSignature = shortcutStatusSignature(state);
  if (!state.status.text || nextSignature === previousSignature) {
    return;
  }
  notifyShortcutState(state);
}

function appendEvents(events: ShortcutDebugEvent[]): void {
  if (!events.length) {
    return;
  }
  shortcutEvents.value = [...shortcutEvents.value, ...events].slice(-180);
  lastShortcutEventId = shortcutEvents.value.length ? shortcutEvents.value[shortcutEvents.value.length - 1].id : lastShortcutEventId;
}

async function initialize(): Promise<void> {
  loading.value = true;
  errorMessage.value = "";
  try {
    const payload = await backendClient.getRuntimeSnapshot();
    lastCharactersRevision = payload.charactersRevision;
    applyState(payload.shortcutsState);
    startPolling();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Impossible de charger les raccourcis.";
  } finally {
    loading.value = false;
  }
}

function startPolling(): void {
  stopPolling();
  pollHandle = window.setInterval(() => {
    void pollShortcuts();
  }, 1000);
}

function stopPolling(): void {
  if (pollHandle !== null) {
    window.clearInterval(pollHandle);
    pollHandle = null;
  }
}

async function pollShortcuts(): Promise<void> {
  try {
    const payload = await backendClient.pollRuntime(lastCharactersRevision, 0, lastShortcutEventId);
    lastCharactersRevision = payload.charactersRevision;
    applyState(payload.shortcutsState, true);
    appendEvents(payload.shortcutEvents);
  } catch {
    // Silence polling errors to avoid noisy UI.
  }
}

async function setShortcutValue(action: ShortcutAction, value: string | null): Promise<void> {
  busy.value = true;
  errorMessage.value = "";
  statusMessage.value = "";
  try {
    const payload = await backendClient.setShortcut(action, value);
    applyState(payload.shortcutsState);
    statusMessage.value = value ? `Raccourci ${action} mis a jour.` : `Raccourci ${action} supprime.`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Impossible de mettre a jour le raccourci.";
  } finally {
    busy.value = false;
  }
}

async function applyShortcuts(): Promise<void> {
  busy.value = true;
  errorMessage.value = "";
  statusMessage.value = "";
  try {
    const payload = await backendClient.applyShortcuts();
    applyState(payload.shortcutsState);
    notifyShortcutState(payload.shortcutsState, "Raccourcis appliques.");
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Impossible d'appliquer les raccourcis.";
  } finally {
    busy.value = false;
  }
}

async function setDebug(enabled: boolean): Promise<void> {
  busy.value = true;
  errorMessage.value = "";
  statusMessage.value = "";
  try {
    const payload = await backendClient.setShortcutsDebug(enabled);
    applyState(payload.shortcutsState);
    if (!enabled) {
      shortcutEvents.value = [];
      lastShortcutEventId = 0;
    }
    statusMessage.value = enabled ? "Mode debug actif." : "Mode debug desactive.";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Impossible de mettre a jour le debug.";
  } finally {
    busy.value = false;
  }
}

function beginCapture(action: ShortcutAction): void {
  if (captureAction.value === action) {
    stopCapture();
    return;
  }
  captureAction.value = action;
  document.addEventListener("keydown", onCaptureKeydown, true);
  document.addEventListener("mousedown", onCaptureMousedown, true);
  document.addEventListener("contextmenu", preventCaptureContextMenu, true);
}

function stopCapture(): void {
  if (!captureAction.value) {
    return;
  }
  captureAction.value = null;
  document.removeEventListener("keydown", onCaptureKeydown, true);
  document.removeEventListener("mousedown", onCaptureMousedown, true);
  document.removeEventListener("contextmenu", preventCaptureContextMenu, true);
}

function preventCaptureContextMenu(event: Event): void {
  if (!captureAction.value) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

async function persistCapturedShortcut(combo: string): Promise<void> {
  const action = captureAction.value;
  stopCapture();
  if (!action) {
    return;
  }
  await setShortcutValue(action, combo);
}

function onCaptureKeydown(event: KeyboardEvent): void {
  if (!captureAction.value) {
    return;
  }
  const combo = shortcutFromKeyboardEvent(event);
  event.preventDefault();
  event.stopPropagation();
  if (combo === null) {
    if (event.key === "Escape") {
      stopCapture();
    }
    return;
  }
  void persistCapturedShortcut(combo);
}

function onCaptureMousedown(event: MouseEvent): void {
  if (!captureAction.value) {
    return;
  }
  const combo = shortcutFromMouseEvent(event);
  event.preventDefault();
  event.stopPropagation();
  if (combo === null) {
    return;
  }
  void persistCapturedShortcut(combo);
}

const actionRows = computed(() => Object.entries(shortcutMeta) as Array<[ShortcutAction, { title: string; subtitle: string }]>);

onMounted(() => {
  void initialize();
});

onUnmounted(() => {
  stopPolling();
  stopCapture();
});
</script>

<template>
  <div class="space-y-4">
    <ShortcutsToolbar
      :busy="busy"
      :shortcuts-state="shortcutsState"
      :show-debug="showDebug"
      @apply="applyShortcuts"
      @set-debug="setDebug"
      @toggle-debug-panel="showDebug = !showDebug"
    />

    <section class="space-y-3">
      <div v-if="loading" class="rounded-[22px] border border-white/6 bg-[#1b2f3a] px-6 py-10 text-center text-sm text-stone-300/75">
        Chargement...
      </div>
      <ShortcutActionCard
        v-for="[action, meta] in actionRows"
        v-else
        :key="action"
        :action="action"
        :title="meta.title"
        :subtitle="meta.subtitle"
        :value="shortcutsState.values[action]"
        :capture-active="captureAction === action"
        :busy="busy"
        @capture="beginCapture"
        @clear="setShortcutValue($event, null)"
      />
    </section>

    <ShortcutEventsPanel v-if="showDebug" :events="shortcutEvents" />
    <ToastStack :status-message="statusMessage" :error-message="errorMessage" />
  </div>
</template>
