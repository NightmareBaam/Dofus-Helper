import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveCatalogDirectories } from "./runtimePaths.js";

const TRIGRAM_SIZE = 3;
const KNOWN_SOURCES = new Set(["all", "retro", "unity"]);

export interface CraftCatalogResource {
  name: string;
  quantity: number;
}

export interface CraftCatalogItem {
  key: string;
  name: string;
  normalizedName: string;
  category: string;
  source: string;
  level: number;
  url: string;
  panoplie: string;
  panoplieUrl: string;
  recipe: CraftCatalogResource[];
}

export interface CraftCatalogState {
  available: boolean;
  message: string;
}

function catalogDirectories(): string[] {
  return resolveCatalogDirectories();
}

function normalizeSourceFilter(value: string | null | undefined): string {
  const normalized = String(value ?? "all").trim().toLowerCase();
  return KNOWN_SOURCES.has(normalized) ? normalized : "all";
}

function sourceFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.includes("retro")) {
    return "retro";
  }
  if (lower.includes("unity")) {
    return "unity";
  }
  return "unknown";
}

function sourceLabel(source: string): string {
  if (source === "retro") {
    return "Retro";
  }
  if (source === "unity") {
    return "Unity";
  }
  return source ? `${source.charAt(0).toUpperCase()}${source.slice(1)}` : "Autre";
}

function escapeEmbeddedQuotesInJsonLines(rawText: string): string {
  return rawText
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^(\s*"[^\"]+"\s*:\s*")(.*)("\s*,?\s*)$/);
      if (!match) {
        return line;
      }
      const [, prefix, value, suffix] = match;
      return `${prefix}${value.replace(/(?<!\\)"/g, '\\"')}${suffix}`;
    })
    .join("\n");
}

function parseCatalogText(rawText: string): Record<string, unknown> {
  let patched = escapeEmbeddedQuotesInJsonLines(rawText);
  patched = patched.replaceAll('"panoplieurl"', '"panoplieUrl"');
  patched = patched.replace(
    /"recette"\s*:\s*\[\s*"panoplie"\s*:\s*"([^"]*)"\s*"panoplieUrl"\s*:\s*"([^"]*)"\s*,/gis,
    '"panoplie": "$1", "panoplieUrl": "$2", "recette": [',
  );
  patched = patched.replace(
    /"recette"\s*:\s*\[\s*"panoplie"\s*:\s*"([^"]*)"\s*"panoplieUrl"\s*:\s*"([^"]*)"\s*(\{)/gis,
    '"panoplie": "$1", "panoplieUrl": "$2", "recette": [$3',
  );
  patched = patched.replace(/,(\s*[\]}])/g, "$1");
  const parsed = JSON.parse(patched);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Le catalogue d'items doit etre un objet JSON par categorie.");
  }
  return parsed as Record<string, unknown>;
}

function parsePositiveInt(value: unknown, fallback = 1): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.trunc(value));
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  const digits = String(value).match(/\d+/g);
  if (!digits?.length) {
    return fallback;
  }
  const parsed = Number.parseInt(digits[0], 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : fallback;
}

function parseNonNegativeInt(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  const digits = String(value).match(/-?\d+/g);
  if (!digits?.length) {
    return fallback;
  }
  const parsed = Number.parseInt(digits[0], 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
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

function normalizeSearch(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) {
    return "";
  }
  const noAccents = raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return noAccents.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function iterTrigrams(value: string): string[] {
  const compact = value.replaceAll(" ", "");
  if (!compact) {
    return [];
  }
  if (compact.length < TRIGRAM_SIZE) {
    return [compact];
  }
  const trigrams = new Set<string>();
  for (let index = 0; index <= compact.length - TRIGRAM_SIZE; index += 1) {
    trigrams.add(compact.slice(index, index + TRIGRAM_SIZE));
  }
  return [...trigrams];
}

function matchScore(normalizedName: string, normalizedQuery: string): number {
  if (normalizedName.startsWith(normalizedQuery)) {
    return 0;
  }
  if (normalizedName.split(" ").some((part) => part.startsWith(normalizedQuery))) {
    return 1;
  }
  return 2;
}

function normalizeRecipeResource(value: unknown): CraftCatalogResource | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const name = String(candidate.nom ?? candidate.name ?? "").trim();
  if (!name) {
    return null;
  }
  return {
    name,
    quantity: parsePositiveInt(candidate.quantite ?? candidate.quantity, 1),
  };
}

function buildItemKey(source: string, category: string, name: string, level: number, url: string, seen: Set<string>): string {
  const base = normalizeSearch(`${source} ${url || `${category} ${name} ${level}`}`).replaceAll(" ", "-") || `${source}-${category}-${level}`;
  let candidate = base;
  let suffix = 2;
  while (seen.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  seen.add(candidate);
  return candidate;
}

function normalizeItem(source: string, category: string, value: unknown, seenKeys: Set<string>): CraftCatalogItem | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const name = String(candidate.nom ?? candidate.name ?? "").trim();
  if (!name) {
    return null;
  }
  const normalizedName = normalizeSearch(name);
  if (normalizedName.length < TRIGRAM_SIZE) {
    return null;
  }

  const recipe = Array.isArray(candidate.recette)
    ? candidate.recette.map(normalizeRecipeResource).filter((item): item is CraftCatalogResource => item !== null)
    : [];

  const level = parseNonNegativeInt(candidate.niveau ?? candidate.level, 0);
  const url = String(candidate.url ?? "").trim();
  const panoplie = String(candidate.panoplie ?? "").trim();
  const panoplieUrl = String(candidate.panoplieUrl ?? candidate.panoplieurl ?? "").trim();

  return {
    key: buildItemKey(source, category, name, level, url, seenKeys),
    name,
    normalizedName,
    category: String(category).trim(),
    source,
    level,
    url,
    panoplie,
    panoplieUrl,
    recipe,
  };
}

function summarizeItem(item: CraftCatalogItem): Record<string, unknown> {
  return {
    key: item.key,
    name: item.name,
    category: item.category,
    source: item.source,
    sourceLabel: sourceLabel(item.source),
    level: item.level,
    url: item.url,
    panoplie: item.panoplie,
    panoplieUrl: item.panoplieUrl,
    recipeCount: item.recipe.length,
  };
}

function detectCatalogFiles(): Array<{ source: string; path: string }> {
  const files: Array<{ source: string; path: string }> = [];
  const seen = new Set<string>();
  for (const directory of catalogDirectories()) {
    if (!existsSync(directory)) {
      continue;
    }
    for (const fileName of readdirSync(directory)) {
      if (!/^dofus.*_items\.json$/i.test(fileName)) {
        continue;
      }
      const path = resolve(directory, fileName);
      const lower = path.toLowerCase();
      if (seen.has(lower)) {
        continue;
      }
      seen.add(lower);
      files.push({ source: sourceFromPath(fileName), path });
    }
  }
  return files;
}

class CraftCatalogIndex {
  private items: CraftCatalogItem[] = [];
  private itemsByKey = new Map<string, CraftCatalogItem>();
  private trigramIndex = new Map<string, number[]>();
  private errorMessage = "Catalogue craft indisponible.";

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      const catalogFiles = detectCatalogFiles();
      if (!catalogFiles.length) {
        this.errorMessage = "Aucun catalogue d'items trouve.";
        return;
      }

      const items: CraftCatalogItem[] = [];
      const trigramSets = new Map<string, Set<number>>();
      const seenKeys = new Set<string>();

      for (const file of catalogFiles) {
        const parsed = parseCatalogText(readFileSync(file.path, "utf8"));
        for (const [category, rawItems] of Object.entries(parsed)) {
          if (!Array.isArray(rawItems)) {
            continue;
          }
          for (const rawItem of rawItems) {
            const item = normalizeItem(file.source, category, rawItem, seenKeys);
            if (!item) {
              continue;
            }
            const index = items.length;
            items.push(item);
            for (const trigram of iterTrigrams(item.normalizedName)) {
              if (!trigramSets.has(trigram)) {
                trigramSets.set(trigram, new Set<number>());
              }
              trigramSets.get(trigram)?.add(index);
            }
          }
        }
      }

      this.items = items;
      this.itemsByKey = new Map(items.map((item) => [item.key, item]));
      this.trigramIndex = new Map([...trigramSets.entries()].map(([key, value]) => [key, [...value].sort((a, b) => a - b)]));
      this.errorMessage = items.length ? "" : "Aucun item exploitable trouve dans les catalogues craft.";
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : "Catalogue craft indisponible.";
    }
  }

  state(): CraftCatalogState {
    return {
      available: this.items.length > 0,
      message: this.items.length > 0 ? "" : this.errorMessage,
    };
  }

  getItem(key: string | null | undefined): CraftCatalogItem | null {
    const normalized = String(key ?? "").trim();
    return normalized ? this.itemsByKey.get(normalized) ?? null : null;
  }

  search(query: string, limit: number, sourceFilter: string): Record<string, unknown>[] {
    const normalizedQuery = normalizeSearch(query);
    if (normalizedQuery.length < TRIGRAM_SIZE) {
      return [];
    }
    const safeSourceFilter = normalizeSourceFilter(sourceFilter);
    const queryTrigrams = iterTrigrams(normalizedQuery);
    if (!queryTrigrams.length) {
      return [];
    }

    const candidateSets = queryTrigrams
      .map((trigram) => this.trigramIndex.get(trigram))
      .filter((value): value is number[] => Array.isArray(value));

    if (candidateSets.length !== queryTrigrams.length) {
      return [];
    }

    candidateSets.sort((left, right) => left.length - right.length);
    let candidates = new Set(candidateSets[0]);
    for (const subset of candidateSets.slice(1)) {
      candidates = new Set([...candidates].filter((index) => subset.includes(index)));
      if (!candidates.size) {
        return [];
      }
    }

    const scored = [...candidates]
      .map((index) => this.items[index])
      .filter((item) => safeSourceFilter === "all" || item.source === safeSourceFilter)
      .filter((item) => item.normalizedName.includes(normalizedQuery))
      .map((item) => ({ item, score: matchScore(item.normalizedName, normalizedQuery) }))
      .sort((left, right) => left.score - right.score || left.item.level - right.item.level || left.item.name.localeCompare(right.item.name, "fr"))
      .slice(0, Math.max(1, Math.min(25, Math.trunc(limit) || 12)));

    return scored.map(({ item }) => summarizeItem(item));
  }

  buildResources(item: CraftCatalogItem, existingResources?: Array<Record<string, unknown>>, idFactory?: (prefix: string) => string): Array<Record<string, unknown>> {
    const existingByName = new Map<string, Record<string, unknown>>();
    for (const resource of existingResources ?? []) {
      const normalized = normalizeSearch(resource.name);
      if (normalized && !existingByName.has(normalized)) {
        existingByName.set(normalized, resource);
      }
    }

    return item.recipe.map((resource) => {
      const previous = existingByName.get(normalizeSearch(resource.name));
      return {
        id: String(previous?.id ?? idFactory?.("resource") ?? buildItemKey("resource", "resource", resource.name, resource.quantity, "", new Set())),
        name: resource.name,
        unit_price: parseFloatSafe(previous?.unit_price ?? previous?.unitPrice ?? 0, 0),
        quantity: Math.max(1, resource.quantity),
        owned_quantity: parseNonNegativeInt(previous?.owned_quantity ?? previous?.ownedQuantity ?? 0, 0),
        included: parseBool(previous?.included ?? true, true),
      };
    });
  }
}

export const craftCatalog = new CraftCatalogIndex();
