export type CharacterNotifType = "combat" | "echange" | "groupe" | "mp";
export type ShortcutAction = "next" | "prev" | "last" | "refresh" | "helper";

export interface CharacterRule {
  combat: boolean;
  echange: boolean;
  groupe: boolean;
  mp: boolean;
  rotation: boolean;
}

export interface CharacterWindow {
  index: number;
  hwnd: number;
  title: string;
  pseudo: string;
  gameType: "retro" | "unity";
  classe: string | null;
  version: string | null;
  rule: CharacterRule;
  rotationEnabled: boolean;
  shortcut: string | null;
}

export interface CharactersConfig {
  enableRetro: boolean;
  enableUnity: boolean;
  copyMpSender: boolean;
  order: number[];
  rules: Record<string, CharacterRule>;
}

export interface CharactersPayload {
  ok: boolean;
  windows: CharacterWindow[];
  config: CharactersConfig;
  availableTypes: CharacterNotifType[];
  message?: string;
}

export interface AutofocusLogEntry {
  id: number;
  timestamp: string;
  message: string;
  tag: string;
}

export interface AutofocusStats {
  notifications: string;
  matches: string;
  focus: string;
  last: string;
}

export interface AutofocusState {
  available: boolean;
  running: boolean;
  debugEnabled: boolean;
  enabledTypes: Record<CharacterNotifType, boolean>;
  stats: AutofocusStats;
  accessStatus: string;
  logs?: AutofocusLogEntry[];
}

export interface ShortcutStatus {
  text: string;
  tone: "muted" | "danger";
}

export interface ShortcutsState {
  values: Record<ShortcutAction, string | null>;
  status: ShortcutStatus;
  debugEnabled: boolean;
  keyboardAvailable: boolean;
  mouseAvailable: boolean;
}

export interface ShortcutDebugEvent {
  id: number;
  timestamp: string;
  shortcut: string;
  recognized: boolean;
}

export interface RuntimeSnapshotPayload {
  ok: boolean;
  charactersRevision: number;
  charactersPayload: CharactersPayload;
  autofocusState: AutofocusState;
  shortcutsState: ShortcutsState;
}

export interface RuntimePollPayload {
  ok: boolean;
  charactersRevision: number;
  charactersPayload: CharactersPayload | null;
  autofocusLogs: AutofocusLogEntry[];
  autofocusState: AutofocusState;
  shortcutEvents: ShortcutDebugEvent[];
  shortcutsState: ShortcutsState;
}

export interface LinkItem {
  id: string;
  label: string;
  url: string;
}

export interface LinkGroup {
  id: string;
  name: string;
  collapsed: boolean;
  links: LinkItem[];
}

export interface LinksPayload {
  ok: boolean;
  links: LinkGroup[];
  message?: string;
}

export interface CatalogSearchItem {
  key: string;
  name: string;
  category: string;
  source: string;
  sourceLabel: string;
  level: number;
  url: string;
  panoplie: string;
  panoplieUrl: string;
  recipeCount: number;
}

export interface CraftCatalogState {
  available: boolean;
  message: string;
}

export interface CraftResource {
  id: string;
  name: string;
  unit_price: number;
  quantity: number;
  owned_quantity: number;
  included: boolean;
}

export interface CraftItem {
  id: string;
  name: string;
  sell_price: number;
  target_quantity: number;
  collapsed: boolean;
  item_key: string | null;
  item_category: string | null;
  item_source: string | null;
  item_level: number;
  item_url: string | null;
  item_panoplie: string | null;
  item_panoplie_url: string | null;
  resources: CraftResource[];
}

export interface CraftsPayload {
  ok: boolean;
  crafts: CraftItem[];
  message?: string;
  craftCatalogState: CraftCatalogState;
}

export interface RetroFamiliarMealInterval {
  start: number;
  end: number;
  unit: string;
}

export interface RetroFamiliarFood {
  name: string;
  effect: string;
  url: string | null;
  type: string | null;
}

export interface RetroFamiliarEffect {
  label: string;
  rangeMin: number | null;
  rangeMax: number | null;
  boostedMax: number | null;
  foods: RetroFamiliarFood[];
}

export interface RetroFamiliarItem {
  key: string;
  name: string;
  url: string | null;
  imageName: string | null;
  mealInterval: RetroFamiliarMealInterval | null;
  feedable: boolean;
  foods: string[];
  effects: RetroFamiliarEffect[];
}

export interface RetroFamiliarTimingState {
  canFeed: boolean;
  overdue: boolean;
  neverFed: boolean;
  nextFeedAt: string | null;
  lateFeedAt: string | null;
  hoursUntilNextMeal: number | null;
  hoursSinceLastMeal: number | null;
}

export interface RetroFamiliarEntry {
  id: string;
  addedAt: string;
  lastFedAt: string | null;
  serverName: string | null;
  characterName: string | null;
  familiar: RetroFamiliarItem;
  status: RetroFamiliarTimingState;
}

export interface RetroFamiliarsPayload {
  ok: boolean;
  entries: RetroFamiliarEntry[];
  encyclopedia: RetroFamiliarItem[];
  dueCount: number;
  knownServers: string[];
  message?: string;
  catalogState: {
    available: boolean;
    message: string;
  };
}

const DEFAULT_BACKEND_URL = "http://127.0.0.1:3210";

function resolveBaseUrl(): string {
  const configuredUrl = import.meta.env.VITE_BACKEND_URL;
  if (typeof configuredUrl === "string" && configuredUrl.trim().length > 0) {
    return configuredUrl.replace(/\/$/, "");
  }
  return DEFAULT_BACKEND_URL;
}

export function buildBackendUrl(pathname: string): string {
  return `${resolveBaseUrl()}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

async function requestJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${resolveBaseUrl()}${pathname}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });

    const payload = (await response.json()) as T & { ok?: boolean; message?: string };
    if (!response.ok) {
      throw new Error(payload.message || `HTTP ${response.status}`);
    }
    return payload;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export const backendClient = {
  getRuntimeSnapshot(): Promise<RuntimeSnapshotPayload> {
    return requestJson<RuntimeSnapshotPayload>("/api/runtime");
  },

  pollRuntime(lastCharactersRevision: number, lastAutofocusLogId: number, lastShortcutEventId: number): Promise<RuntimePollPayload> {
    const params = new URLSearchParams({
      lastCharactersRevision: String(lastCharactersRevision),
      lastAutofocusLogId: String(lastAutofocusLogId),
      lastShortcutEventId: String(lastShortcutEventId),
    });
    return requestJson<RuntimePollPayload>(`/api/runtime/poll?${params.toString()}`);
  },

  refreshCharacters(): Promise<CharactersPayload> {
    return requestJson<CharactersPayload>("/api/characters/refresh", { method: "POST" });
  },

  setCharacterFilter(gameType: string, enabled: boolean): Promise<CharactersPayload> {
    return requestJson<CharactersPayload>("/api/characters/filters", {
      method: "PATCH",
      body: JSON.stringify({ gameType, enabled }),
    });
  },

  setCopyMpSender(enabled: boolean): Promise<CharactersPayload> {
    return requestJson<CharactersPayload>("/api/characters/copy-mp", {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
  },

  saveCharacterOrder(hwnds: number[]): Promise<CharactersPayload> {
    return requestJson<CharactersPayload>("/api/characters/order", {
      method: "POST",
      body: JSON.stringify({ hwnds }),
    });
  },

  setAllCharacterRules(notifType: CharacterNotifType, enabled: boolean): Promise<CharactersPayload> {
    return requestJson<CharactersPayload>("/api/characters/rules", {
      method: "PATCH",
      body: JSON.stringify({ notifType, enabled }),
    });
  },

  setCharacterRule(pseudo: string, notifType: CharacterNotifType, enabled: boolean): Promise<{ ok: boolean; rule: CharacterRule; config: CharactersConfig; message?: string }> {
    return requestJson<{ ok: boolean; rule: CharacterRule; config: CharactersConfig; message?: string }>(`/api/characters/rules/${encodeURIComponent(pseudo)}`, {
      method: "PATCH",
      body: JSON.stringify({ notifType, enabled }),
    });
  },

  setCharacterRotation(pseudo: string, enabled: boolean): Promise<{ ok: boolean; rule: CharacterRule; config: CharactersConfig }> {
    return requestJson<{ ok: boolean; rule: CharacterRule; config: CharactersConfig }>(`/api/characters/rotation/${encodeURIComponent(pseudo)}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
  },

  setCharacterShortcut(pseudo: string, value: string | null): Promise<CharactersPayload> {
    return requestJson<CharactersPayload>(`/api/characters/shortcuts/${encodeURIComponent(pseudo)}`, {
      method: "PATCH",
      body: JSON.stringify({ value }),
    });
  },

  focusCharacterWindow(hwnd: number): Promise<{ ok: boolean; message: string }> {
    return requestJson<{ ok: boolean; message: string }>(`/api/characters/focus/${hwnd}`, {
      method: "POST",
    });
  },

  setAutofocusType(notifType: CharacterNotifType, enabled: boolean): Promise<{ ok: boolean; autofocusState: AutofocusState; message?: string }> {
    return requestJson<{ ok: boolean; autofocusState: AutofocusState; message?: string }>("/api/autofocus/types", {
      method: "PATCH",
      body: JSON.stringify({ notifType, enabled }),
    });
  },

  setAutofocusDebug(enabled: boolean): Promise<{ ok: boolean; autofocusState: AutofocusState }> {
    return requestJson<{ ok: boolean; autofocusState: AutofocusState }>("/api/autofocus/debug", {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
  },

  setShortcut(action: ShortcutAction, value: string | null): Promise<{ ok: boolean; shortcutsState: ShortcutsState; message?: string }> {
    return requestJson<{ ok: boolean; shortcutsState: ShortcutsState; message?: string }>(`/api/shortcuts/${action}`, {
      method: "PATCH",
      body: JSON.stringify({ value }),
    });
  },

  applyShortcuts(): Promise<{ ok: boolean; shortcutsState: ShortcutsState }> {
    return requestJson<{ ok: boolean; shortcutsState: ShortcutsState }>("/api/shortcuts/apply", {
      method: "POST",
    });
  },

  setShortcutsDebug(enabled: boolean): Promise<{ ok: boolean; shortcutsState: ShortcutsState }> {
    return requestJson<{ ok: boolean; shortcutsState: ShortcutsState }>("/api/shortcuts/debug", {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
  },

  listLinks(): Promise<LinksPayload> {
    return requestJson<LinksPayload>("/api/links");
  },

  addLinkGroup(name: string): Promise<LinksPayload> {
    return requestJson<LinksPayload>("/api/links/groups", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },

  renameLinkGroup(groupId: string, name: string): Promise<LinksPayload> {
    return requestJson<LinksPayload>(`/api/links/groups/${groupId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  },

  deleteLinkGroup(groupId: string): Promise<LinksPayload> {
    return requestJson<LinksPayload>(`/api/links/groups/${groupId}`, {
      method: "DELETE",
    });
  },

  saveLinkGroupOrder(groupIds: string[]): Promise<LinksPayload> {
    return requestJson<LinksPayload>("/api/links/groups/reorder", {
      method: "POST",
      body: JSON.stringify({ groupIds }),
    });
  },

  setLinkGroupCollapsed(groupId: string, collapsed: boolean): Promise<LinksPayload> {
    return requestJson<LinksPayload>(`/api/links/groups/${groupId}`, {
      method: "PATCH",
      body: JSON.stringify({ collapsed }),
    });
  },

  addLink(groupId: string, label: string, url: string): Promise<LinksPayload> {
    return requestJson<LinksPayload>(`/api/links/groups/${groupId}/links`, {
      method: "POST",
      body: JSON.stringify({ label, url }),
    });
  },

  updateLink(groupId: string, linkId: string, label: string, url: string): Promise<LinksPayload> {
    return requestJson<LinksPayload>(`/api/links/groups/${groupId}/links/${linkId}`, {
      method: "PATCH",
      body: JSON.stringify({ label, url }),
    });
  },

  deleteLink(groupId: string, linkId: string): Promise<LinksPayload> {
    return requestJson<LinksPayload>(`/api/links/groups/${groupId}/links/${linkId}`, {
      method: "DELETE",
    });
  },

  saveLinkOrder(groupId: string, linkIds: string[]): Promise<LinksPayload> {
    return requestJson<LinksPayload>(`/api/links/groups/${groupId}/links/reorder`, {
      method: "POST",
      body: JSON.stringify({ linkIds }),
    });
  },

  listCrafts(): Promise<CraftsPayload> {
    return requestJson<CraftsPayload>("/api/crafts");
  },

  searchCraftItems(query: string, limit = 12, source = "all"): Promise<{ ok: boolean; items: CatalogSearchItem[]; message?: string }> {
    const params = new URLSearchParams({ query, limit: String(limit), source });
    return requestJson<{ ok: boolean; items: CatalogSearchItem[]; message?: string }>(`/api/crafts/catalog/search?${params.toString()}`);
  },

  addCraft(name: string, sellPrice: number, targetQuantity: number, itemKey: string | null): Promise<CraftsPayload> {
    return requestJson<CraftsPayload>("/api/crafts", {
      method: "POST",
      body: JSON.stringify({ name, sellPrice, targetQuantity, itemKey }),
    });
  },

  updateCraft(craftId: string, name: string, sellPrice: number, targetQuantity: number, itemKey: string | null): Promise<CraftsPayload> {
    return requestJson<CraftsPayload>(`/api/crafts/${craftId}`, {
      method: "PATCH",
      body: JSON.stringify({ name, sellPrice, targetQuantity, itemKey }),
    });
  },

  setCraftCollapsed(craftId: string, collapsed: boolean): Promise<CraftsPayload> {
    return requestJson<CraftsPayload>(`/api/crafts/${craftId}/collapsed`, {
      method: "PATCH",
      body: JSON.stringify({ collapsed }),
    });
  },

  setAllCraftsCollapsed(collapsed: boolean): Promise<CraftsPayload> {
    return requestJson<CraftsPayload>("/api/crafts/collapse-all", {
      method: "PATCH",
      body: JSON.stringify({ collapsed }),
    });
  },

  saveCraftOrder(craftIds: string[]): Promise<CraftsPayload> {
    return requestJson<CraftsPayload>("/api/crafts/reorder", {
      method: "POST",
      body: JSON.stringify({ craftIds }),
    });
  },

  deleteCraft(craftId: string): Promise<CraftsPayload> {
    return requestJson<CraftsPayload>(`/api/crafts/${craftId}`, {
      method: "DELETE",
    });
  },

  addCraftResource(craftId: string, name: string, unitPrice: number, quantity: number, ownedQuantity: number, included: boolean): Promise<CraftsPayload> {
    return requestJson<CraftsPayload>(`/api/crafts/${craftId}/resources`, {
      method: "POST",
      body: JSON.stringify({ name, unitPrice, quantity, ownedQuantity, included }),
    });
  },

  updateCraftResource(craftId: string, resourceId: string, name: string, unitPrice: number, quantity: number, ownedQuantity: number, included: boolean): Promise<CraftsPayload> {
    return requestJson<CraftsPayload>(`/api/crafts/${craftId}/resources/${resourceId}`, {
      method: "PATCH",
      body: JSON.stringify({ name, unitPrice, quantity, ownedQuantity, included }),
    });
  },

  deleteCraftResource(craftId: string, resourceId: string): Promise<CraftsPayload> {
    return requestJson<CraftsPayload>(`/api/crafts/${craftId}/resources/${resourceId}`, {
      method: "DELETE",
    });
  },

  listRetroFamiliars(): Promise<RetroFamiliarsPayload> {
    return requestJson<RetroFamiliarsPayload>("/api/familiars/retro");
  },

  getRetroFamiliarsSummary(): Promise<{ ok: boolean; dueCount: number; message?: string; catalogState: { available: boolean; message: string } }> {
    return requestJson<{ ok: boolean; dueCount: number; message?: string; catalogState: { available: boolean; message: string } }>("/api/familiars/retro/summary");
  },

  addRetroFamiliar(familiarKey: string, serverName?: string | null, characterName?: string | null): Promise<RetroFamiliarsPayload> {
    return requestJson<RetroFamiliarsPayload>("/api/familiars/retro/entries", {
      method: "POST",
      body: JSON.stringify({ familiarKey, serverName: serverName ?? null, characterName: characterName ?? null }),
    });
  },

  updateRetroFamiliar(entryId: string, patch: { serverName?: string | null; characterName?: string | null }): Promise<RetroFamiliarsPayload> {
    return requestJson<RetroFamiliarsPayload>(`/api/familiars/retro/entries/${entryId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  feedRetroFamiliar(entryId: string, fedAt?: string | null): Promise<RetroFamiliarsPayload> {
    return requestJson<RetroFamiliarsPayload>(`/api/familiars/retro/entries/${entryId}/feed`, {
      method: "PATCH",
      body: JSON.stringify({ fedAt: fedAt ?? null }),
    });
  },

  deleteRetroFamiliar(entryId: string): Promise<RetroFamiliarsPayload> {
    return requestJson<RetroFamiliarsPayload>(`/api/familiars/retro/entries/${entryId}`, {
      method: "DELETE",
    });
  },
};
