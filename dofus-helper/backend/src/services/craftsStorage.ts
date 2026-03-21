import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { craftCatalog, type CraftCatalogItem } from "./craftCatalog.js";
import { resolveDataFile } from "./runtimePaths.js";

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
  craftCatalogState: {
    available: boolean;
    message: string;
  };
}

function makeId(prefix: string): string {
  return `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 8)}`;
}

function parseFloatSafe(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  const parsed = Number.parseFloat(String(value).trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePositiveInt(value: unknown, fallback = 1): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.trunc(value));
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : fallback;
}

function parseNonNegativeInt(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

function parseBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(raw)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(raw)) {
    return false;
  }
  return fallback;
}

function parseOptionalString(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  return raw || null;
}

function cloneCrafts(crafts: CraftItem[]): CraftItem[] {
  return crafts.map((craft) => ({
    ...craft,
    resources: craft.resources.map((resource) => ({ ...resource })),
  }));
}

function normalizeResource(value: unknown): CraftResource | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  return {
    id: String(candidate.id ?? makeId("resource")).trim() || makeId("resource"),
    name: String(candidate.name ?? "").trim(),
    unit_price: Math.max(0, parseFloatSafe(candidate.unit_price ?? candidate.unitPrice, 0)),
    quantity: parsePositiveInt(candidate.quantity, 1),
    owned_quantity: parseNonNegativeInt(candidate.owned_quantity ?? candidate.ownedQuantity, 0),
    included: parseBool(candidate.included, true),
  };
}

function normalizeCraft(value: unknown): CraftItem | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const name = String(candidate.name ?? "").trim();
  if (!name) {
    return null;
  }
  const resources = Array.isArray(candidate.resources)
    ? candidate.resources.map(normalizeResource).filter((resource): resource is CraftResource => resource !== null)
    : [];

  return {
    id: String(candidate.id ?? makeId("craft")).trim() || makeId("craft"),
    name,
    sell_price: Math.max(0, parseFloatSafe(candidate.sell_price ?? candidate.sellPrice, 0)),
    target_quantity: parsePositiveInt(candidate.target_quantity ?? candidate.targetQuantity, 1),
    collapsed: parseBool(candidate.collapsed, false),
    item_key: parseOptionalString(candidate.item_key ?? candidate.itemKey),
    item_category: parseOptionalString(candidate.item_category ?? candidate.itemCategory),
    item_source: parseOptionalString(candidate.item_source ?? candidate.itemSource),
    item_level: parseNonNegativeInt(candidate.item_level ?? candidate.itemLevel, 0),
    item_url: parseOptionalString(candidate.item_url ?? candidate.itemUrl),
    item_panoplie: parseOptionalString(candidate.item_panoplie ?? candidate.itemPanoplie),
    item_panoplie_url: parseOptionalString(candidate.item_panoplie_url ?? candidate.itemPanoplieUrl),
    resources,
  };
}

function resolveStorageFilePath(): string {
  return resolveDataFile("crafts.json");
}

function readStoredCrafts(): CraftItem[] {
  const filePath = resolveStorageFilePath();
  if (!existsSync(filePath)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeCraft).filter((craft): craft is CraftItem => craft !== null);
  } catch {
    return [];
  }
}

function writeStoredCrafts(crafts: CraftItem[]): CraftItem[] {
  const filePath = resolveStorageFilePath();
  mkdirSync(dirname(filePath), { recursive: true });
  const normalized = crafts.map(normalizeCraft).filter((craft): craft is CraftItem => craft !== null);
  writeFileSync(filePath, JSON.stringify(normalized, null, 2), "utf8");
  return cloneCrafts(normalized);
}

function payload(ok: boolean, crafts: CraftItem[], message = "", persist = ok): CraftsPayload {
  return {
    ok,
    crafts: persist ? writeStoredCrafts(crafts) : cloneCrafts(crafts),
    message: message || undefined,
    craftCatalogState: craftCatalog.state(),
  };
}

function getCraft(crafts: CraftItem[], craftId: string): CraftItem | undefined {
  return crafts.find((craft) => craft.id === craftId);
}

function getCraftResource(craft: CraftItem, resourceId: string): CraftResource | undefined {
  return craft.resources.find((resource) => resource.id === resourceId);
}

function applyCatalogMetadata(craft: CraftItem, item: CraftCatalogItem | null): void {
  if (!item) {
    clearCatalogMetadata(craft);
    return;
  }
  craft.item_key = item.key;
  craft.item_category = item.category;
  craft.item_source = item.source;
  craft.item_level = item.level;
  craft.item_url = item.url || null;
  craft.item_panoplie = item.panoplie || null;
  craft.item_panoplie_url = item.panoplieUrl || null;
}

function clearCatalogMetadata(craft: CraftItem): void {
  craft.item_key = null;
  craft.item_category = null;
  craft.item_source = null;
  craft.item_level = 0;
  craft.item_url = null;
  craft.item_panoplie = null;
  craft.item_panoplie_url = null;
}

export const craftsStorage = {
  list(): CraftsPayload {
    return payload(true, readStoredCrafts(), "", false);
  },

  searchCatalog(query: string, limit: number, sourceFilter: string): Record<string, unknown> {
    const catalogState = craftCatalog.state();
    if (!catalogState.available) {
      return { ok: false, message: catalogState.message || "Catalogue craft indisponible.", items: [] };
    }
    return {
      ok: true,
      items: craftCatalog.search(query, limit, sourceFilter),
    };
  },

  addCraft(name: string, sellPrice: number, targetQuantity: number, itemKey?: string | null): CraftsPayload {
    const crafts = readStoredCrafts();
    const catalogItem = craftCatalog.getItem(itemKey);
    if (itemKey && !catalogItem) {
      return payload(false, crafts, "Item introuvable dans la base de craft.");
    }
    const craftName = catalogItem?.name ?? String(name).trim();
    if (!craftName) {
      return payload(false, crafts, "Nom de craft invalide.");
    }

    const craft: CraftItem = {
      id: makeId("craft"),
      name: craftName,
      sell_price: Math.max(0, parseFloatSafe(sellPrice, 0)),
      target_quantity: parsePositiveInt(targetQuantity, 1),
      collapsed: false,
      item_key: null,
      item_category: null,
      item_source: null,
      item_level: 0,
      item_url: null,
      item_panoplie: null,
      item_panoplie_url: null,
      resources: catalogItem ? craftCatalog.buildResources(catalogItem, [], makeId).map(normalizeResource).filter((resource): resource is CraftResource => resource !== null) : [],
    };
    applyCatalogMetadata(craft, catalogItem);
    crafts.push(craft);
    return payload(true, crafts);
  },

  updateCraft(craftId: string, name: string, sellPrice: number, targetQuantity: number, itemKey?: string | null): CraftsPayload {
    const crafts = readStoredCrafts();
    const craft = getCraft(crafts, craftId);
    if (!craft) {
      return payload(false, crafts, "Craft introuvable.");
    }

    const catalogItem = craftCatalog.getItem(itemKey);
    if (itemKey && !catalogItem) {
      return payload(false, crafts, "Item introuvable dans la base de craft.");
    }

    const craftName = catalogItem?.name ?? String(name).trim();
    if (!craftName) {
      return payload(false, crafts, "Nom de craft invalide.");
    }

    const previousItemKey = craft.item_key;
    craft.name = craftName;
    craft.sell_price = Math.max(0, parseFloatSafe(sellPrice, 0));
    craft.target_quantity = parsePositiveInt(targetQuantity, 1);

    if (catalogItem) {
      applyCatalogMetadata(craft, catalogItem);
      if (previousItemKey !== catalogItem.key || !craft.resources.length) {
        craft.resources = craftCatalog.buildResources(catalogItem, craft.resources as unknown as Array<Record<string, unknown>>, makeId)
          .map(normalizeResource)
          .filter((resource): resource is CraftResource => resource !== null);
      }
    } else {
      clearCatalogMetadata(craft);
    }

    return payload(true, crafts);
  },

  setTargetQuantity(craftId: string, targetQuantity: number): CraftsPayload {
    const crafts = readStoredCrafts();
    const craft = getCraft(crafts, craftId);
    if (!craft) {
      return payload(false, crafts, "Craft introuvable.");
    }
    craft.target_quantity = parsePositiveInt(targetQuantity, 1);
    return payload(true, crafts);
  },

  setCollapsed(craftId: string, collapsed: boolean): CraftsPayload {
    const crafts = readStoredCrafts();
    const craft = getCraft(crafts, craftId);
    if (!craft) {
      return payload(false, crafts, "Craft introuvable.");
    }
    craft.collapsed = Boolean(collapsed);
    return payload(true, crafts);
  },

  setAllCollapsed(collapsed: boolean): CraftsPayload {
    const crafts = readStoredCrafts();
    for (const craft of crafts) {
      craft.collapsed = Boolean(collapsed);
    }
    return payload(true, crafts);
  },

  saveOrder(craftIds: string[]): CraftsPayload {
    const crafts = readStoredCrafts();
    if (!craftIds.length) {
      return payload(false, crafts, "Ordre de crafts invalide.");
    }
    const byId = new Map(crafts.map((craft) => [craft.id, craft]));
    const ordered = craftIds.map((craftId) => byId.get(craftId)).filter((craft): craft is CraftItem => Boolean(craft));
    if (!ordered.length) {
      return payload(false, crafts, "Ordre de crafts invalide.");
    }
    const remaining = crafts.filter((craft) => !craftIds.includes(craft.id));
    return payload(true, [...ordered, ...remaining]);
  },

  deleteCraft(craftId: string): CraftsPayload {
    const crafts = readStoredCrafts();
    const next = crafts.filter((craft) => craft.id !== craftId);
    if (next.length === crafts.length) {
      return payload(false, crafts, "Craft introuvable.");
    }
    return payload(true, next);
  },

  addResource(craftId: string, name: string, unitPrice: number, quantity: number, ownedQuantity: number, included: boolean): CraftsPayload {
    const crafts = readStoredCrafts();
    const craft = getCraft(crafts, craftId);
    if (!craft) {
      return payload(false, crafts, "Craft introuvable.");
    }
    craft.resources.push({
      id: makeId("resource"),
      name: String(name ?? "").trim(),
      unit_price: Math.max(0, parseFloatSafe(unitPrice, 0)),
      quantity: parsePositiveInt(quantity, 1),
      owned_quantity: parseNonNegativeInt(ownedQuantity, 0),
      included: Boolean(included),
    });
    return payload(true, crafts);
  },

  updateResource(craftId: string, resourceId: string, name: string, unitPrice: number, quantity: number, ownedQuantity: number, included: boolean): CraftsPayload {
    const crafts = readStoredCrafts();
    const craft = getCraft(crafts, craftId);
    if (!craft) {
      return payload(false, crafts, "Craft introuvable.");
    }
    const resource = getCraftResource(craft, resourceId);
    if (!resource) {
      return payload(false, crafts, "Ressource introuvable.");
    }
    resource.name = String(name ?? "").trim();
    resource.unit_price = Math.max(0, parseFloatSafe(unitPrice, 0));
    resource.quantity = parsePositiveInt(quantity, 1);
    resource.owned_quantity = parseNonNegativeInt(ownedQuantity, 0);
    resource.included = Boolean(included);
    return payload(true, crafts);
  },

  deleteResource(craftId: string, resourceId: string): CraftsPayload {
    const crafts = readStoredCrafts();
    const craft = getCraft(crafts, craftId);
    if (!craft) {
      return payload(false, crafts, "Craft introuvable.");
    }
    const nextResources = craft.resources.filter((resource) => resource.id !== resourceId);
    if (nextResources.length === craft.resources.length) {
      return payload(false, crafts, "Ressource introuvable.");
    }
    craft.resources = nextResources;
    return payload(true, crafts);
  },
};
