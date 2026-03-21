import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function resolveRuntimeRoot(): string {
  const configuredRoot = process.env.DOFUS_HELPER_RESOURCES_DIR?.trim();
  return configuredRoot || process.cwd();
}

function defaultDataDirectory(): string {
  const appData = process.env.LOCALAPPDATA?.trim();
  if (appData) {
    return resolve(appData, "DofusHelper", "data");
  }
  const userProfile = process.env.USERPROFILE?.trim();
  if (userProfile) {
    return resolve(userProfile, ".dofus-helper", "data");
  }
  return resolve(resolveRuntimeRoot(), ".dofus-helper-data");
}

export function resolveDataFile(fileName: string): string {
  const configuredDir = process.env.DOFUS_HELPER_DATA_DIR?.trim();
  if (configuredDir) {
    return resolve(configuredDir, fileName);
  }
  return resolve(defaultDataDirectory(), fileName);
}

export function resolveCatalogDirectories(): string[] {
  const root = resolveRuntimeRoot();
  const configuredCatalogDir = process.env.DOFUS_HELPER_CATALOG_DIR?.trim();
  const candidates = [
    configuredCatalogDir,
    resolve(root, "..", "bdd_items"),
    resolve(root, "..", "bdd"),
    resolve(root, "bdd_items"),
    resolve(root, "bdd"),
    resolve(root, "_up_", "bdd_items"),
    resolve(root, "_up_", "bdd"),
    resolve(root, "_up_", "_up_", "bdd_items"),
    resolve(root, "_up_", "_up_", "bdd"),
    resolve(root, "..", "_up_", "bdd_items"),
    resolve(root, "..", "_up_", "bdd"),
  ].filter((value): value is string => Boolean(value));

  const uniqueExisting = [...new Set(candidates.map((value) => resolve(value)))].filter((value) => existsSync(value));
  return uniqueExisting.length ? uniqueExisting : candidates;
}

export function resolveRetroFamiliarImageDirectories(): string[] {
  const root = resolveRuntimeRoot();
  const configuredAssetsDir = process.env.DOFUS_HELPER_ASSETS_DIR?.trim();
  const candidates = [
    configuredAssetsDir ? resolve(configuredAssetsDir, "familier_retro") : null,
    resolve(root, "..", "assets", "familier_retro"),
    resolve(root, "assets", "familier_retro"),
    resolve(root, "_up_", "assets", "familier_retro"),
    resolve(root, "_up_", "_up_", "assets", "familier_retro"),
    resolve(root, "..", "_up_", "assets", "familier_retro"),
  ].filter((value): value is string => Boolean(value));

  const uniqueExisting = [...new Set(candidates.map((value) => resolve(value)))].filter((value) => existsSync(value));
  return uniqueExisting.length ? uniqueExisting : candidates;
}
