import type { World } from "@ai-novel/shared/types/world";

export const LAYERS = [
  { key: "foundation", label: "L1 base layer", primaryField: "background" },
  { key: "power", label: "L2 Strength Layer", primaryField: "magicSystem" },
  { key: "society", label: "L3 Social Level", primaryField: "politics" },
  { key: "culture", label: "L4 Cultural Layer", primaryField: "cultures" },
  { key: "history", label: "L5 Historical Layer", primaryField: "history" },
  { key: "conflict", label: "L6 Conflict Layer", primaryField: "conflicts" },
] as const;

export type LayerKey = (typeof LAYERS)[number]["key"];

export type LayerField =
  | "description"
  | "background"
  | "geography"
  | "cultures"
  | "magicSystem"
  | "politics"
  | "races"
  | "religions"
  | "technology"
  | "conflicts"
  | "history"
  | "economy"
  | "factions";

export const LAYER_STATUS_LABELS: Record<string, string> = { pending: "To be generated", generated: "Generated", confirmed: "Confirmed", stale: "To be rebuilt", }; export const LAYER_FIELDS_BY_KEY: Record<LayerKey, LayerField[]> = {
  foundation: ["background", "geography"],
  power: ["magicSystem", "technology"],
  society: ["politics", "races", "factions"],
  culture: ["cultures", "religions", "economy"],
  history: ["history"],
  conflict: ["conflicts", "description"],
};

export type RefineAttribute =
  | "description"
  | "background"
  | "geography"
  | "cultures"
  | "magicSystem"
  | "politics"
  | "races"
  | "religions"
  | "technology"
  | "conflicts"
  | "history"
  | "economy"
  | "factions";

export const REFINE_ATTRIBUTE_OPTIONS: Array<{ value: RefineAttribute; label: string }> = [
  { value: "background", label: "basic background" },
  { value: "geography", label: "geographical environment" },
  { value: "cultures", label: "cultural customs" },
  { value: "magicSystem", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." },
  { value: "politics", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." },
  { value: "races", label: "Race settings" },
  { value: "religions", label: "religious beliefs" },
  { value: "technology", label: "Technical system" },
  { value: "history", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." },
  { value: "economy", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." },
  { value: "conflicts", label: "core conflict" },
  { value: "description", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." },
  { value: "factions", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." },
];

export function normalizeLayerText(raw: unknown): string {
  if (typeof raw === "string") {
    return formatLayerTextString(raw);
  }
  if (raw === null || raw === undefined) {
    return "";
  }
  if (typeof raw === "object") {
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      return "";
    }
  }
  return String(raw);
}

function formatLayerTextString(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return raw;
  }
  try {
    return formatLayerStructuredValue(JSON.parse(trimmed));
  } catch {
    return raw;
  }
}

function formatLayerStructuredValue(raw: unknown): string {
  if (typeof raw === "string") {
    return raw.trim();
  }
  if (typeof raw === "number" || typeof raw === "boolean") {
    return String(raw);
  }
  if (Array.isArray(raw)) {
    return raw.map(formatLayerStructuredValue).filter(Boolean).join("\n");
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .map(([key, value]) => {
        const text = formatLayerStructuredValue(value);
        return text ? `${key}：${text.replace(/\n/g, "；")}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

export function pickLayerFieldText(layerKey: LayerKey, source: Record<string, unknown> | undefined): string {
  if (!source) {
    return "";
  }
  for (const field of LAYER_FIELDS_BY_KEY[layerKey]) {
    const text = normalizeLayerText(source[field]).trim();
    if (text) {
      return text;
    }
  }
  return "";
}

export function parseLayerStates(raw: string | null | undefined) {
  try {
    return JSON.parse(raw ?? "{}") as Record<string, { status: string; updatedAt: string }>;
  } catch {
    return {};
  }
}

export function getWorldField(world: World | undefined, field: keyof World): string {
  const value = world?.[field];
  return typeof value === "string" ? value : "";
}
