<script setup lang="ts">
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/vue";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import logoUrl from "./assets/logo.png";
import CharactersWorkspaceView from "./views/CharactersWorkspaceView.vue";
import CraftsWorkspaceView from "./views/CraftsWorkspaceView.vue";
import LinksWorkspaceView from "./views/LinksWorkspaceView.vue";
import RetroFamiliarsWorkspaceView from "./views/RetroFamiliarsWorkspaceView.vue";
import SettingsWorkspaceView from "./views/SettingsWorkspaceView.vue";
import ShortcutsWorkspaceView from "./views/ShortcutsWorkspaceView.vue";
import { backendClient } from "./services/backendClient";

type MainViewId = "characters" | "shortcuts" | "crafts" | "links" | "retro-familiars";
type ViewId = MainViewId | "settings";

interface NavItem {
  id: MainViewId;
  label: string;
}

type NavVisibility = Record<MainViewId, boolean>;

const VIEW_STORAGE_KEY = "dofus-helper.current-view";
const NAV_VISIBILITY_KEY = "dofus-helper.nav-visibility";
const NAV_ORDER_STORAGE_KEY = "dofus-helper.nav-order";
const COMPACT_MODE_STORAGE_KEY = "dofus-helper.characters.compact-mode";
const RETRO_FAMILIARS_SUMMARY_POLL_MS = 15_000;
const DEFAULT_WINDOW_MIN_SIZE = new LogicalSize(800, 600);
const COMPACT_WINDOW_MIN_SIZE = new LogicalSize(480, 560);
const COMPACT_WINDOW_SIZE = new LogicalSize(520, 720);

const navItems: NavItem[] = [
  { id: "characters", label: "Personnages" },
  { id: "shortcuts", label: "Raccourcis" },
  { id: "retro-familiars", label: "Familiers (Retro)" },
  { id: "links", label: "Liens utiles" },
  { id: "crafts", label: "Calculette craft" },
];
const NAV_ITEM_IDS = navItems.map((item) => item.id);
const NAV_ITEMS_BY_ID = Object.fromEntries(navItems.map((item) => [item.id, item])) as Record<MainViewId, NavItem>;

function defaultNavVisibility(): NavVisibility {
  return {
    characters: true,
    shortcuts: true,
    "retro-familiars": true,
    links: true,
    crafts: true,
  };
}

function isMainViewId(value: string | null | undefined): value is MainViewId {
  return NAV_ITEM_IDS.includes(String(value ?? "") as MainViewId);
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function defaultNavOrder(): MainViewId[] {
  return [...NAV_ITEM_IDS];
}

function orderedNavItemsFrom(order: MainViewId[]): NavItem[] {
  return order.map((id) => NAV_ITEMS_BY_ID[id]).filter(Boolean);
}

function firstVisibleViewId(visibility: NavVisibility, order: MainViewId[]): MainViewId | null {
  return orderedNavItemsFrom(order).find((item) => visibility[item.id])?.id ?? null;
}

function resolveInitialVisibility(): NavVisibility {
  const fallback = defaultNavVisibility();
  const raw = window.localStorage.getItem(NAV_VISIBILITY_KEY);
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Record<MainViewId, unknown>>;
    const nextValue: NavVisibility = {
      characters: parsed.characters !== false,
      shortcuts: parsed.shortcuts !== false,
      "retro-familiars": parsed["retro-familiars"] !== false,
      links: parsed.links !== false,
      crafts: parsed.crafts !== false,
    };
    return firstVisibleViewId(nextValue, defaultNavOrder()) ? nextValue : fallback;
  } catch {
    return fallback;
  }
}

function resolveInitialOrder(): MainViewId[] {
  const fallback = defaultNavOrder();
  const raw = window.localStorage.getItem(NAV_ORDER_STORAGE_KEY);
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return fallback;
    }
    const nextOrder = parsed.filter((value): value is MainViewId => isMainViewId(String(value)));
    if (nextOrder.length !== fallback.length) {
      return fallback;
    }
    if (new Set(nextOrder).size !== fallback.length) {
      return fallback;
    }
    return nextOrder;
  } catch {
    return fallback;
  }
}

function resolveInitialView(visibility: NavVisibility, order: MainViewId[]): ViewId {
  const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
  if (stored === "settings") {
    return "settings";
  }
  if (isMainViewId(stored) && visibility[stored]) {
    return stored;
  }
  return firstVisibleViewId(visibility, order) ?? "settings";
}

const navVisibility = ref<NavVisibility>(resolveInitialVisibility());
const navOrder = ref<MainViewId[]>(resolveInitialOrder());
const currentView = ref<ViewId>(resolveInitialView(navVisibility.value, navOrder.value));
const compactMode = ref(window.localStorage.getItem(COMPACT_MODE_STORAGE_KEY) === "1");
const previousWindowSize = ref<{ width: number; height: number } | null>(null);
const retroFamiliarsDueCount = ref(0);
let retroFamiliarsSummaryHandle: number | null = null;

const orderedNavItems = computed(() => orderedNavItemsFrom(navOrder.value));
const visibleNavItems = computed(() => orderedNavItems.value.filter((item) => navVisibility.value[item.id]));
const visibleTabCount = computed(() => visibleNavItems.value.length);
const settingsTabs = computed(() =>
  orderedNavItems.value.map((item) => ({
    ...item,
    visible: navVisibility.value[item.id],
    canHide: !navVisibility.value[item.id] || visibleTabCount.value > 1,
  })),
);
const activeCompactLayout = computed(() => compactMode.value && currentView.value === "characters");
const navBadges = computed<Record<MainViewId, number>>(() => ({
  characters: 0,
  shortcuts: 0,
  "retro-familiars": retroFamiliarsDueCount.value,
  links: 0,
  crafts: 0,
}));

async function syncWindowLayout(enabled: boolean): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    if (enabled) {
      const currentSize = await appWindow.innerSize();
      const scaleFactor = await appWindow.scaleFactor();
      const logicalSize = currentSize.toLogical(scaleFactor);
      previousWindowSize.value = {
        width: logicalSize.width,
        height: logicalSize.height,
      };
      await appWindow.setMinSize(COMPACT_WINDOW_MIN_SIZE);
      await appWindow.setSize(COMPACT_WINDOW_SIZE);
      return;
    }

    await appWindow.setMinSize(DEFAULT_WINDOW_MIN_SIZE);
    const restoreSize = previousWindowSize.value;
    if (restoreSize) {
      await appWindow.setSize(
        new LogicalSize(
          Math.max(restoreSize.width, DEFAULT_WINDOW_MIN_SIZE.width),
          Math.max(restoreSize.height, DEFAULT_WINDOW_MIN_SIZE.height),
        ),
      );
    }
  } catch {
    // Ignore resize failures.
  }
}

function setCurrentView(viewId: ViewId): void {
  if (viewId === "settings" || navVisibility.value[viewId]) {
    currentView.value = viewId;
  }
}

function setTabVisibility(viewId: MainViewId, visible: boolean): void {
  if (!visible && navVisibility.value[viewId] && visibleTabCount.value <= 1) {
    return;
  }
  navVisibility.value = {
    ...navVisibility.value,
    [viewId]: visible,
  };
}

function reorderTabs(tabId: MainViewId, targetTabId: MainViewId): void {
  if (tabId === targetTabId) {
    return;
  }
  const fromIndex = navOrder.value.indexOf(tabId);
  const toIndex = navOrder.value.indexOf(targetTabId);
  if (fromIndex === -1 || toIndex === -1) {
    return;
  }
  const nextOrder = [...navOrder.value];
  const [moved] = nextOrder.splice(fromIndex, 1);
  nextOrder.splice(toIndex, 0, moved);
  navOrder.value = nextOrder;
}

function toggleCompactMode(): void {
  compactMode.value = !compactMode.value;
}

async function loadRetroFamiliarsSummary(): Promise<void> {
  try {
    const payload = await backendClient.getRetroFamiliarsSummary();
    retroFamiliarsDueCount.value = payload.catalogState.available ? payload.dueCount : 0;
  } catch {
    retroFamiliarsDueCount.value = 0;
  }
}

function startRetroFamiliarsSummaryPolling(): void {
  if (retroFamiliarsSummaryHandle !== null) {
    window.clearInterval(retroFamiliarsSummaryHandle);
  }
  void loadRetroFamiliarsSummary();
  retroFamiliarsSummaryHandle = window.setInterval(() => {
    void loadRetroFamiliarsSummary();
  }, RETRO_FAMILIARS_SUMMARY_POLL_MS);
}

function stopRetroFamiliarsSummaryPolling(): void {
  if (retroFamiliarsSummaryHandle !== null) {
    window.clearInterval(retroFamiliarsSummaryHandle);
    retroFamiliarsSummaryHandle = null;
  }
}

function setRetroFamiliarsDueCount(nextValue: number): void {
  retroFamiliarsDueCount.value = Math.max(0, Math.trunc(nextValue));
}

function handleWindowFocus(): void {
  void loadRetroFamiliarsSummary();
}

function handleVisibilityChange(): void {
  if (document.visibilityState === "visible") {
    void loadRetroFamiliarsSummary();
  }
}

watch(currentView, (value) => {
  window.localStorage.setItem(VIEW_STORAGE_KEY, value);
});

watch(compactMode, (value) => {
  window.localStorage.setItem(COMPACT_MODE_STORAGE_KEY, value ? "1" : "0");
});

watch(activeCompactLayout, (value) => {
  void syncWindowLayout(value);
}, { immediate: true });

watch(
  navVisibility,
  (value) => {
    window.localStorage.setItem(NAV_VISIBILITY_KEY, JSON.stringify(value));
    if (currentView.value !== "settings" && !value[currentView.value]) {
      currentView.value = firstVisibleViewId(value, navOrder.value) ?? "settings";
    }
  },
  { deep: true },
);

watch(
  navOrder,
  (value) => {
    window.localStorage.setItem(NAV_ORDER_STORAGE_KEY, JSON.stringify(value));
  },
  { deep: true },
);

onMounted(() => {
  startRetroFamiliarsSummaryPolling();
  window.addEventListener("focus", handleWindowFocus);
  document.addEventListener("visibilitychange", handleVisibilityChange);
});

onUnmounted(() => {
  stopRetroFamiliarsSummaryPolling();
  window.removeEventListener("focus", handleWindowFocus);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
});
</script>

<template>
  <div class="min-h-screen bg-[#071117] text-stone-50">
    <template v-if="activeCompactLayout">
      <header class="border-b border-white/6 bg-[#061015] px-4 py-4">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-4">
            <img :src="logoUrl" alt="Dofus Helper" class="h-10 w-auto shrink-0 object-contain" />
            <div class="text-[14px] font-semibold text-[#f5f0e3]">Dofus Helper</div>
          </div>

          <button
            type="button"
            class="flex h-11 w-11 items-center justify-center rounded-[14px] border border-white/8 bg-[#162127] text-[#c8d2cf] transition hover:border-[#324b3c] hover:text-[#f3f1e7] cursor-pointer"
            :class="currentView === 'settings' ? 'border-[#324b3c] bg-[#172822] text-[#f3f1e7]' : ''"
            @click="setCurrentView('settings')"
          >
            <HugeiconsIcon :icon="Settings01Icon" :size="20" :stroke-width="1.8" />
          </button>
        </div>

        <nav class="mt-4 flex flex-wrap items-center gap-3 border-b border-white/6 pb-4">
          <button
            v-for="item in visibleNavItems"
            :key="item.id"
            type="button"
            class="rounded-[16px] border px-4 py-2.5 text-[14px] font-medium transition cursor-pointer"
            :class="currentView === item.id
              ? 'border-[#324b3c] bg-[#172822] text-[#f3f1e7] shadow-[inset_0_0_0_1px_rgba(167,210,70,0.08)]'
              : 'border-transparent bg-transparent text-[#f0ece0] hover:border-white/6 hover:bg-white/3'"
            @click="setCurrentView(item.id)"
          >
            <span class="flex items-center gap-2">
              <span>{{ item.label }}</span>
              <span
                v-if="navBadges[item.id] > 0"
                class="inline-flex min-w-6 shrink-0 items-center justify-center rounded-full border border-[#3a532e] bg-[#24331f] px-2 py-0.5 text-[11px] font-semibold text-[#a7d246]"
              >
                {{ navBadges[item.id] }}
              </span>
            </span>
          </button>
        </nav>
      </header>

      <main class="background min-h-[calc(100vh-136px)] px-3 py-3">
        <div class="mx-auto max-w-[720px]">
          <CharactersWorkspaceView
            v-if="currentView === 'characters'"
            :compact-mode="activeCompactLayout"
            @toggle-compact="toggleCompactMode"
          />
          <ShortcutsWorkspaceView v-else-if="currentView === 'shortcuts'" />
          <RetroFamiliarsWorkspaceView
            v-else-if="currentView === 'retro-familiars'"
            @update-due-count="setRetroFamiliarsDueCount"
          />
          <CraftsWorkspaceView v-else-if="currentView === 'crafts'" />
          <LinksWorkspaceView v-else-if="currentView === 'links'" />
          <SettingsWorkspaceView
            v-else
            :tabs="settingsTabs"
            @update-tab-visibility="setTabVisibility"
            @reorder-tabs="reorderTabs"
          />
        </div>
      </main>
    </template>

    <template v-else>
      <div class="min-h-screen lg:grid lg:grid-cols-[192px_minmax(0,1fr)]">
        <aside class="border-b border-white/6 bg-[#061015] px-3 py-4 lg:border-b-0 lg:border-r lg:px-3 lg:py-5">
          <div class="flex h-full flex-col">
            <div class="flex items-center gap-3 lg:block">
              <img :src="logoUrl" alt="Dofus Helper" class="h-14 w-auto shrink-0 object-contain lg:mx-auto lg:h-20" />
              <div class="min-w-0 lg:mt-2 lg:text-center">
                <div class="text-[13px] font-semibold text-[#f5f0e3]">Dofus Helper</div>
              </div>
            </div>

            <nav class="mt-4 flex gap-2 overflow-x-auto pb-1 lg:mt-6 lg:flex-1 lg:flex-col lg:gap-2 lg:overflow-visible">
              <button
                v-for="item in visibleNavItems"
                :key="item.id"
                type="button"
                class="shrink-0 rounded-[14px] border px-3 py-2.5 text-left text-[13px] font-semibold transition lg:w-full cursor-pointer"
                :class="currentView === item.id
                  ? 'border-[#324b3c] bg-[#172822] text-[#f3f1e7] shadow-[inset_0_0_0_1px_rgba(167,210,70,0.08)]'
                  : 'border-transparent bg-transparent text-[#c8d2cf] hover:border-white/6 hover:bg-white/3'"
                @click="setCurrentView(item.id)"
              >
                <span class="flex items-center justify-between gap-2">
                  <span class="min-w-0 truncate">{{ item.label }}</span>
                  <span
                    v-if="navBadges[item.id] > 0"
                    class="inline-flex min-w-6 shrink-0 items-center justify-center rounded-full border border-[#3a532e] bg-[#24331f] px-2 py-0.5 text-[11px] font-semibold text-[#a7d246]"
                  >
                    {{ navBadges[item.id] }}
                  </span>
                </span>
              </button>
            </nav>

            <div class="mt-4 border-t border-white/6 pt-4">
              <button
                type="button"
                class="w-full rounded-[14px] border px-3 py-2.5 text-left text-[13px] font-semibold transition cursor-pointer"
                :class="currentView === 'settings'
                  ? 'border-[#324b3c] bg-[#172822] text-[#f3f1e7] shadow-[inset_0_0_0_1px_rgba(167,210,70,0.08)]'
                  : 'border-transparent bg-transparent text-[#c8d2cf] hover:border-white/6 hover:bg-white/3'"
                @click="setCurrentView('settings')"
              >
                Parametres
              </button>
            </div>
          </div>
        </aside>

        <main class="background">
          <div class="mx-auto max-w-[1120px] px-4 py-4 lg:px-5 lg:py-5">
            <CharactersWorkspaceView
              v-if="currentView === 'characters'"
              :compact-mode="activeCompactLayout"
              @toggle-compact="toggleCompactMode"
            />
            <ShortcutsWorkspaceView v-else-if="currentView === 'shortcuts'" />
            <RetroFamiliarsWorkspaceView
              v-else-if="currentView === 'retro-familiars'"
              @update-due-count="setRetroFamiliarsDueCount"
            />
            <CraftsWorkspaceView v-else-if="currentView === 'crafts'" />
            <LinksWorkspaceView v-else-if="currentView === 'links'" />
            <SettingsWorkspaceView
              v-else
              :tabs="settingsTabs"
              @update-tab-visibility="setTabVisibility"
              @reorder-tabs="reorderTabs"
            />
          </div>
        </main>
      </div>
    </template>
  </div>
</template>
