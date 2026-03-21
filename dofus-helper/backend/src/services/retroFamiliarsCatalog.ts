import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { resolveCatalogDirectories, resolveRetroFamiliarImageDirectories } from "./runtimePaths.js";

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

export interface RetroFamiliarCatalogState {
  available: boolean;
  message: string;
}

function normalizeSearch(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) {
    return "";
  }
  const noAccents = raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return noAccents.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function buildItemKey(name: string, seen: Set<string>): string {
  const base = normalizeSearch(name).replaceAll(" ", "-") || `familier-${seen.size + 1}`;
  let candidate = base;
  let suffix = 2;
  while (seen.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  seen.add(candidate);
  return candidate;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMealInterval(value: unknown): RetroFamiliarMealInterval | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const start = parseNumber(candidate.start);
  const end = parseNumber(candidate.end);
  const unit = String(candidate.unit ?? "").trim().toLowerCase();
  if (start === null || end === null || !unit) {
    return null;
  }
  return {
    start,
    end,
    unit,
  };
}

function normalizeFood(value: unknown): RetroFamiliarFood | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const name = String(candidate.name ?? "").trim();
  if (!name) {
    return null;
  }
  return {
    name,
    effect: String(candidate.effect ?? "").trim(),
    url: String(candidate.url ?? "").trim() || null,
    type: String(candidate.type ?? "").trim().toLowerCase() || null,
  };
}

function normalizeEffect(value: unknown): RetroFamiliarEffect | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const foods = Array.isArray(candidate.resources)
    ? candidate.resources.map(normalizeFood).filter((item): item is RetroFamiliarFood => item !== null)
    : [];
  const label = String(candidate.label ?? "").trim();
  if (!foods.length && !label) {
    return null;
  }
  const range = typeof candidate.range === "object" && candidate.range !== null
    ? candidate.range as Record<string, unknown>
    : null;
  return {
    label,
    rangeMin: parseNumber(range?.min),
    rangeMax: parseNumber(range?.max),
    boostedMax: parseNumber(candidate.boostedMax),
    foods,
  };
}

function extractImageName(value: unknown, imageNames: Set<string>): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  try {
    const imageName = basename(new URL(raw).pathname);
    return imageNames.has(imageName.toLowerCase()) ? imageName : null;
  } catch {
    return null;
  }
}

function normalizeFamiliar(value: unknown, seenKeys: Set<string>, imageNames: Set<string>): RetroFamiliarItem | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const name = String(candidate.name ?? "").trim();
  if (!name) {
    return null;
  }
  const mealInterval = parseMealInterval(candidate.mealInterval);
  const effects = Array.isArray(candidate.effects)
    ? candidate.effects.map(normalizeEffect).filter((item): item is RetroFamiliarEffect => item !== null)
    : [];
  if (!effects.length) {
    return null;
  }

  const foods = [...new Set(effects.flatMap((effect) => effect.foods.map((food) => food.name)))];
  const feedable = mealInterval !== null && effects.some((effect) => effect.foods.some((food) => food.type === "resource"));

  return {
    key: buildItemKey(name, seenKeys),
    name,
    url: String(candidate.url ?? "").trim() || null,
    imageName: extractImageName(candidate.imageUrl, imageNames),
    mealInterval,
    feedable,
    foods,
    effects,
  };
}

function cloneItem(item: RetroFamiliarItem): RetroFamiliarItem {
  return {
    ...item,
    mealInterval: item.mealInterval ? { ...item.mealInterval } : null,
    feedable: item.feedable,
    foods: [...item.foods],
    effects: item.effects.map((effect) => ({
      ...effect,
      foods: effect.foods.map((food) => ({ ...food })),
    })),
  };
}

function detectCatalogFile(): string | null {
  for (const directory of resolveCatalogDirectories()) {
    const candidate = resolve(directory, "dofus_retro_familiers.json");
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function detectImageNames(): Set<string> {
  const imageNames = new Set<string>();
  for (const directory of resolveRetroFamiliarImageDirectories()) {
    if (!existsSync(directory)) {
      continue;
    }
    try {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isFile()) {
          continue;
        }
        imageNames.add(entry.name.toLowerCase());
      }
    } catch {
      // Ignore unreadable directories.
    }
  }
  return imageNames;
}

class RetroFamiliarsCatalogIndex {
  private items: RetroFamiliarItem[] = [];
  private feedableItems: RetroFamiliarItem[] = [];
  private itemsByKey = new Map<string, RetroFamiliarItem>();
  private errorMessage = "Catalogue familiers indisponible.";

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const catalogFile = detectCatalogFile();
      if (!catalogFile) {
        this.errorMessage = "Catalogue familiers introuvable.";
        return;
      }

      const raw = JSON.parse(readFileSync(catalogFile, "utf8"));
      if (!Array.isArray(raw)) {
        this.errorMessage = "Catalogue familiers invalide.";
        return;
      }

      const imageNames = detectImageNames();
      const seenKeys = new Set<string>();
      this.items = raw
        .map((item) => normalizeFamiliar(item, seenKeys, imageNames))
        .filter((item): item is RetroFamiliarItem => item !== null)
        .sort((left, right) => left.name.localeCompare(right.name, "fr", { sensitivity: "base" }));
      this.feedableItems = this.items.filter((item) => item.feedable);
      this.itemsByKey = new Map(this.items.map((item) => [item.key, item]));

      if (!this.items.length) {
        this.errorMessage = "Aucun familier trouve.";
        return;
      }

      this.errorMessage = "";
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : "Catalogue familiers invalide.";
      this.items = [];
      this.itemsByKey.clear();
    }
  }

  list(): RetroFamiliarItem[] {
    return this.items.map(cloneItem);
  }

  listFeedable(): RetroFamiliarItem[] {
    return this.feedableItems.map(cloneItem);
  }

  getItem(key: string | null | undefined): RetroFamiliarItem | null {
    const item = key ? this.itemsByKey.get(key) : undefined;
    return item ? cloneItem(item) : null;
  }

  getFeedableItem(key: string | null | undefined): RetroFamiliarItem | null {
    const item = key ? this.itemsByKey.get(key) : undefined;
    return item?.feedable ? cloneItem(item) : null;
  }

  state(): RetroFamiliarCatalogState {
    return {
      available: this.items.length > 0,
      message: this.items.length > 0 ? "Catalogue familiers charge." : this.errorMessage,
    };
  }
}

export const retroFamiliarsCatalog = new RetroFamiliarsCatalogIndex();
