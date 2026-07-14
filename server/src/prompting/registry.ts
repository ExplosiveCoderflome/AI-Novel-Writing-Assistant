import { buildPromptAssetKey } from "./core/promptTypes";
import {
  promptAssetLoaderEntries,
  type PromptAssetLoader,
  type PromptAssetLoaderEntry,
  type UnknownPromptAsset,
} from "./registry/promptAssetLoaderEntries";

function createPromptAssetLoaderRegistry(entries: PromptAssetLoaderEntry[]): Map<string, PromptAssetLoader> {
  const registry = new Map<string, PromptAssetLoader>();
  for (const entry of entries) {
    if (registry.has(entry.key)) {
      throw new Error(`Duplicate prompt asset registration: ${entry.key}`);
    }
    registry.set(entry.key, entry.load);
  }
  return registry;
}

const promptAssetLoaderByKey = createPromptAssetLoaderRegistry(promptAssetLoaderEntries);
const promptAssetLoaderEntryByLoad = new Map<PromptAssetLoader, PromptAssetLoaderEntry>(
  promptAssetLoaderEntries.map((entry) => [entry.load, entry] as const),
);
const promptAssetByKey = new Map<string, UnknownPromptAsset>();
const unhydratedPromptAssetLoaders = new Set<PromptAssetLoader>(
  promptAssetLoaderEntries.map((entry) => entry.load),
);

function findCachedPromptAssetByLoader(load: PromptAssetLoader): UnknownPromptAsset | null {
  for (const [key, asset] of promptAssetByKey.entries()) {
    if (promptAssetLoaderByKey.get(key) === load) {
      return asset;
    }
  }
  return null;
}

function cacheLoadedPromptAsset(entry: PromptAssetLoaderEntry, asset: UnknownPromptAsset): UnknownPromptAsset {
  const actualKey = buildPromptAssetKey(asset);
  const registeredLoader = promptAssetLoaderByKey.get(actualKey);
  if (registeredLoader && registeredLoader !== entry.load) {
    throw new Error(`Duplicate prompt asset registration: ${actualKey}`);
  }

  const cachedAsset = promptAssetByKey.get(actualKey);
  if (cachedAsset && cachedAsset !== asset) {
    throw new Error(`Duplicate prompt asset cache entry: ${actualKey}`);
  }

  if (entry.key !== actualKey) {
    const declaredLoader = promptAssetLoaderByKey.get(entry.key);
    if (declaredLoader === entry.load) {
      promptAssetLoaderByKey.delete(entry.key);
    }
  }

  promptAssetLoaderByKey.set(actualKey, entry.load);
  promptAssetByKey.set(actualKey, asset);
  unhydratedPromptAssetLoaders.delete(entry.load);
  return asset;
}

function hydratePromptAssetEntry(entry: PromptAssetLoaderEntry): UnknownPromptAsset {
  const cached = findCachedPromptAssetByLoader(entry.load);
  if (cached) {
    return cached;
  }

  return cacheLoadedPromptAsset(entry, entry.load());
}

function hydratePromptAssetByKey(key: string): void {
  if (promptAssetByKey.has(key)) {
    return;
  }

  for (const entry of promptAssetLoaderEntries) {
    if (!unhydratedPromptAssetLoaders.has(entry.load)) {
      continue;
    }

    const asset = hydratePromptAssetEntry(entry);
    if (buildPromptAssetKey(asset) === key) {
      return;
    }
  }
}

function hydrateAllPromptAssets(): void {
  for (const entry of promptAssetLoaderEntries) {
    if (!unhydratedPromptAssetLoaders.has(entry.load)) {
      continue;
    }
    hydratePromptAssetEntry(entry);
  }
}

function loadRegisteredPromptAsset(key: string): UnknownPromptAsset | null {
  const cached = promptAssetByKey.get(key);
  if (cached) {
    return cached;
  }

  const load = promptAssetLoaderByKey.get(key);
  if (load) {
    const entry = promptAssetLoaderEntryByLoad.get(load);
    if (!entry) {
      return null;
    }

    const asset = hydratePromptAssetEntry(entry);
    return buildPromptAssetKey(asset) === key ? asset : promptAssetByKey.get(key) ?? null;
  }

  hydratePromptAssetByKey(key);
  return promptAssetByKey.get(key) ?? null;
}

export function hasRegisteredPromptAsset(id: string, version: string): boolean {
  return loadRegisteredPromptAsset(`${id}@${version}`) != null;
}

export function listRegisteredPromptAssets(): UnknownPromptAsset[] {
  hydrateAllPromptAssets();
  return [...promptAssetByKey.values()];
}

export function getRegisteredPromptAsset(id: string, version: string): UnknownPromptAsset | null {
  return loadRegisteredPromptAsset(`${id}@${version}`);
}

export function findRegisteredPromptAssetById(id: string): UnknownPromptAsset | null {
  hydrateAllPromptAssets();
  for (const asset of promptAssetByKey.values()) {
    if (asset.id === id) return asset;
  }
  return null;
}
