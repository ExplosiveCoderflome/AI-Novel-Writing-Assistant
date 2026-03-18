import type { WorldLayerKey } from "./world";

export type WorldOptionRefinementLevel = "basic" | "standard" | "detailed";

export interface WorldPropertyOption {
  id: string;
  name: string;
  description: string;
  targetLayer: WorldLayerKey;
  reason?: string | null;
  source: "ai" | "library";
  libraryItemId?: string | null;
}

export interface WorldPropertySelection {
  optionId: string;
  name: string;
  description: string;
  targetLayer: WorldLayerKey;
  detail?: string | null;
  source: "ai" | "library";
  libraryItemId?: string | null;
}

export interface WorldGenerationBlueprint {
  version: 1;
  classicElements: string[];
  propertySelections: WorldPropertySelection[];
}

const WORLD_LAYER_KEYS: WorldLayerKey[] = [
  "foundation",
  "power",
  "society",
  "culture",
  "history",
  "conflict",
];

const WORLD_LAYER_KEY_SET = new Set<WorldLayerKey>(WORLD_LAYER_KEYS);

export function isWorldLayerKey(value: string): value is WorldLayerKey {
  return WORLD_LAYER_KEY_SET.has(value as WorldLayerKey);
}

export function normalizeWorldGenerationBlueprint(
  raw: unknown,
): WorldGenerationBlueprint {
  if (!raw) {
    return {
      version: 1,
      classicElements: [],
      propertySelections: [],
    };
  }

  if (Array.isArray(raw)) {
    const classicElements = raw
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    return {
      version: 1,
      classicElements: Array.from(new Set(classicElements)),
      propertySelections: [],
    };
  }

  if (typeof raw !== "object") {
    return {
      version: 1,
      classicElements: [],
      propertySelections: [],
    };
  }

  const record = raw as Record<string, unknown>;
  const classicElements = Array.isArray(record.classicElements)
    ? record.classicElements
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
    : [];

  const propertySelections = Array.isArray(record.propertySelections)
    ? record.propertySelections
      .map<WorldPropertySelection | null>((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }
        const selection = item as Record<string, unknown>;
        const optionId = typeof selection.optionId === "string"
          ? selection.optionId.trim()
          : typeof selection.id === "string"
            ? selection.id.trim()
            : "";
        const name = typeof selection.name === "string" ? selection.name.trim() : "";
        const description = typeof selection.description === "string" ? selection.description.trim() : "";
        const detail = typeof selection.detail === "string" ? selection.detail.trim() : "";
        const targetLayer = typeof selection.targetLayer === "string" && isWorldLayerKey(selection.targetLayer)
          ? selection.targetLayer
          : null;
        const source = selection.source === "library" ? "library" : "ai";
        const libraryItemId = typeof selection.libraryItemId === "string" ? selection.libraryItemId.trim() : "";

        if (!optionId || !name || !description || !targetLayer) {
          return null;
        }

        return {
          optionId,
          name,
          description,
          detail: detail || null,
          targetLayer,
          source,
          libraryItemId: libraryItemId || null,
        };
      })
      .filter((item): item is WorldPropertySelection => Boolean(item))
    : [];

  return {
    version: 1,
    classicElements: Array.from(new Set(classicElements)),
    propertySelections,
  };
}

export function parseWorldGenerationBlueprint(
  raw: string | null | undefined,
): WorldGenerationBlueprint {
  if (!raw?.trim()) {
    return normalizeWorldGenerationBlueprint(null);
  }

  try {
    return normalizeWorldGenerationBlueprint(JSON.parse(raw));
  } catch {
    return normalizeWorldGenerationBlueprint(raw);
  }
}

export function serializeWorldGenerationBlueprint(
  blueprint: WorldGenerationBlueprint,
): string {
  return JSON.stringify(normalizeWorldGenerationBlueprint(blueprint));
}

export function mapWorldLibraryCategoryToLayer(category: string | null | undefined): WorldLayerKey {
  const normalized = (category ?? "").trim().toLowerCase();
  switch (normalized) {
    case "terrain":
      return "foundation";
    case "power_system":
    case "artifact":
      return "power";
    case "race":
    case "organization":
      return "society";
    case "resource":
      return "culture";
    case "event":
      return "history";
    default:
      return "conflict";
  }
}
