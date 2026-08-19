import i18next from "i18next";
import type { World } from "@ai-novel/shared/types/world";

export const LAYERS = [
  { key: "foundation", label: i18next.t("worlds.worldWorkspaceShared.xwpkfz"), primaryField: "background" },
  { key: "power", label: i18next.t("worlds.worldWorkspaceShared.xwtqx8"), primaryField: "magicSystem" },
  { key: "society", label: i18next.t("worlds.worldWorkspaceShared.xqxkib"), primaryField: "politics" },
  { key: "culture", label: i18next.t("worlds.worldWorkspaceShared.xt91xh"), primaryField: "cultures" },
  { key: "history", label: i18next.t("worlds.worldWorkspaceShared.xvc1pd"), primaryField: "history" },
  { key: "conflict", label: i18next.t("worlds.worldWorkspaceShared.xuvc0z"), primaryField: "conflicts" },
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

export const LAYER_STATUS_LABELS: Record<string, string> = {
  pending: i18next.t("dict.gen_418dde27"),
  generated: i18next.t("dict.gen_c2ad1f29"),
  confirmed: i18next.t("novels.chapterExecution.shared.ecmeg"),
  stale: i18next.t("worlds.worldWorkspaceShared.eozrm"),
};

export const LAYER_FIELDS_BY_KEY: Record<LayerKey, LayerField[]> = {
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
  { value: "background", label: i18next.t("worlds.worldWorkspaceShared.blpe7d") },
  { value: "geography", label: i18next.t("dict.gen_48d19a29") },
  { value: "cultures", label: i18next.t("dict.gen_cca09e79") },
  { value: "magicSystem", label: i18next.t("dict.gen_9185e0fc") },
  { value: "politics", label: i18next.t("dict.gen_9b670f02") },
  { value: "races", label: i18next.t("dict.gen_fe1521ec") },
  { value: "religions", label: i18next.t("dict.gen_ba378fee") },
  { value: "technology", label: i18next.t("dict.gen_ca9a2400") },
  { value: "history", label: i18next.t("dict.gen_efd9a737") },
  { value: "economy", label: i18next.t("dict.gen_c557e9a8") },
  { value: "conflicts", label: i18next.t("dict.gen_ae5f3fde") },
  { value: "description", label: i18next.t("dict.worldDescription") },
  { value: "factions", label: i18next.t("dict.gen_ef535ae0") },
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
