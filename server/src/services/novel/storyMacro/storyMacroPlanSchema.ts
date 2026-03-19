import type {
  StoryConflictLayers,
  StoryDecomposition,
  StoryExpansion,
  StoryMacroField,
  StoryMacroIssue,
  StoryMacroLocks,
  StoryMacroState,
} from "@ai-novel/shared/types/storyMacro";
import { z } from "zod";

const STORY_MACRO_FIELD_SET = new Set<string>([
  "expanded_premise",
  "protagonist_core",
  "conflict_engine",
  "conflict_layers",
  "mystery_box",
  "emotional_line",
  "setpiece_seeds",
  "tone_reference",
  "selling_point",
  "core_conflict",
  "main_hook",
  "progression_loop",
  "growth_path",
  "major_payoffs",
  "ending_flavor",
  "constraints",
  "global",
]);

export const STORY_MACRO_FIELDS = [
  "expanded_premise",
  "protagonist_core",
  "conflict_engine",
  "conflict_layers",
  "mystery_box",
  "emotional_line",
  "setpiece_seeds",
  "tone_reference",
  "selling_point",
  "core_conflict",
  "main_hook",
  "progression_loop",
  "growth_path",
  "major_payoffs",
  "ending_flavor",
  "constraints",
] as const satisfies StoryMacroField[];

export const EMPTY_STATE: StoryMacroState = {
  currentPhase: 0,
  progress: 0,
  protagonistState: "",
};

export const EMPTY_CONFLICT_LAYERS: StoryConflictLayers = {
  external: "",
  internal: "",
  relational: "",
};

export const EMPTY_EXPANSION: StoryExpansion = {
  expanded_premise: "",
  protagonist_core: "",
  conflict_engine: "",
  conflict_layers: EMPTY_CONFLICT_LAYERS,
  mystery_box: "",
  emotional_line: "",
  setpiece_seeds: [],
  tone_reference: "",
};

export const EMPTY_DECOMPOSITION: StoryDecomposition = {
  selling_point: "",
  core_conflict: "",
  main_hook: "",
  progression_loop: "",
  growth_path: "",
  major_payoffs: [],
  ending_flavor: "",
};

const conflictLayersSchema = z.object({
  external: z.string().trim().min(1).max(280),
  internal: z.string().trim().min(1).max(280),
  relational: z.string().trim().min(1).max(280),
});

export const STORY_MACRO_RESPONSE_SCHEMA = z.object({
  expansion: z.object({
    expanded_premise: z.string().trim().min(1).max(900),
    protagonist_core: z.string().trim().min(1).max(500),
    conflict_engine: z.string().trim().min(1).max(500),
    conflict_layers: conflictLayersSchema,
    mystery_box: z.string().trim().min(1).max(320),
    emotional_line: z.string().trim().min(1).max(400),
    setpiece_seeds: z.array(z.string().trim().min(1).max(260)).min(2).max(3),
    tone_reference: z.string().trim().min(1).max(320),
  }),
  decomposition: z.object({
    selling_point: z.string().trim().min(1).max(200),
    core_conflict: z.string().trim().min(1).max(320),
    main_hook: z.string().trim().min(1).max(320),
    progression_loop: z.string().trim().min(1).max(400),
    growth_path: z.string().trim().min(1).max(400),
    major_payoffs: z.array(z.string().trim().min(1).max(220)).min(2).max(5),
    ending_flavor: z.string().trim().min(1).max(220),
  }),
  constraints: z.array(z.string().trim().min(1).max(240)).min(2).max(8),
  issues: z.array(z.object({
    type: z.string().trim().min(1).max(40),
    field: z.string().trim().min(1).max(60),
    message: z.string().trim().min(1).max(300),
  })).max(8).default([]),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, maxItems);
}

function mergeUnique(items: string[], maxItems: number): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(0, maxItems);
}

export function toText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
        return item.text;
      }
      return "";
    }).join("");
  }
  return JSON.stringify(content ?? "");
}

export function extractJSONObject(source: string): string {
  const cleaned = source.replace(/```json|```/gi, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last < 0 || first >= last) {
    throw new Error("Story Macro Plan AI 输出中未检测到有效 JSON 对象。");
  }
  return cleaned.slice(first, last + 1);
}

export function safeParseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw?.trim()) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function normalizeConflictLayers(value: unknown): StoryConflictLayers {
  if (isRecord(value)) {
    return {
      external: normalizeText(value.external),
      internal: normalizeText(value.internal),
      relational: normalizeText(value.relational),
    };
  }
  const legacy = normalizeStringArray(value, 3);
  return {
    external: legacy[0] ?? "",
    internal: legacy[1] ?? "",
    relational: legacy[2] ?? "",
  };
}

export function normalizeExpansion(
  value: (Partial<Omit<StoryExpansion, "conflict_layers">> & { conflict_layers?: unknown }) | null | undefined,
): StoryExpansion {
  const nextValue = value;
  return {
    expanded_premise: normalizeText(nextValue?.expanded_premise),
    protagonist_core: normalizeText(nextValue?.protagonist_core),
    conflict_engine: normalizeText(nextValue?.conflict_engine),
    conflict_layers: normalizeConflictLayers(nextValue?.conflict_layers),
    mystery_box: normalizeText(nextValue?.mystery_box),
    emotional_line: normalizeText(nextValue?.emotional_line),
    setpiece_seeds: normalizeStringArray(nextValue?.setpiece_seeds, 3),
    tone_reference: normalizeText(nextValue?.tone_reference),
  };
}

export function normalizeDecomposition(value: Partial<StoryDecomposition> | null | undefined): StoryDecomposition {
  return {
    selling_point: normalizeText(value?.selling_point),
    core_conflict: normalizeText(value?.core_conflict),
    main_hook: normalizeText(value?.main_hook),
    progression_loop: normalizeText(value?.progression_loop),
    growth_path: normalizeText(value?.growth_path),
    major_payoffs: normalizeStringArray(value?.major_payoffs, 5),
    ending_flavor: normalizeText(value?.ending_flavor),
  };
}

export function normalizeConstraints(value: unknown): string[] {
  if (Array.isArray(value)) {
    return mergeUnique(value.map((item) => (typeof item === "string" ? item : "")), 8);
  }
  if (isRecord(value)) {
    const forbidden = normalizeStringArray(value.forbidden, 4);
    const requiredTrends = normalizeStringArray(value.required_trends, 4);
    return mergeUnique([...requiredTrends, ...forbidden.map((item) => `避免：${item}`)], 8);
  }
  return [];
}

export function normalizeLockedFields(value: unknown): StoryMacroLocks {
  if (!isRecord(value)) {
    return {};
  }
  return STORY_MACRO_FIELDS.reduce<StoryMacroLocks>((acc, field) => {
    if (typeof value[field] === "boolean") {
      acc[field] = value[field] as boolean;
    }
    return acc;
  }, {});
}

export function hasMeaningfulExpansion(value: StoryExpansion | null | undefined): value is StoryExpansion {
  if (!value) {
    return false;
  }
  return Boolean(
    value.expanded_premise
    || value.protagonist_core
    || value.conflict_engine
    || value.conflict_layers.external
    || value.conflict_layers.internal
    || value.conflict_layers.relational
    || value.mystery_box
    || value.emotional_line
    || value.setpiece_seeds.length > 0
    || value.tone_reference,
  );
}

export function hasMeaningfulDecomposition(value: StoryDecomposition | null | undefined): value is StoryDecomposition {
  if (!value) {
    return false;
  }
  return Boolean(
    value.selling_point
    || value.core_conflict
    || value.main_hook
    || value.progression_loop
    || value.growth_path
    || value.major_payoffs.length > 0
    || value.ending_flavor,
  );
}

export function isDecompositionComplete(value: Partial<StoryDecomposition> | null | undefined): value is StoryDecomposition {
  return Boolean(
    value
    && typeof value.selling_point === "string"
    && value.selling_point.trim()
    && typeof value.core_conflict === "string"
    && value.core_conflict.trim()
    && typeof value.main_hook === "string"
    && value.main_hook.trim()
    && typeof value.progression_loop === "string"
    && value.progression_loop.trim()
    && typeof value.growth_path === "string"
    && value.growth_path.trim()
    && Array.isArray(value.major_payoffs)
    && value.major_payoffs.length > 0
    && value.major_payoffs.every((item) => typeof item === "string" && item.trim())
    && typeof value.ending_flavor === "string"
    && value.ending_flavor.trim(),
  );
}

export function normalizeIssues(value: Array<{ type: string; field: string; message: string }>): StoryMacroIssue[] {
  return value.slice(0, 8).map((item) => ({
    type: item.type === "conflict" ? "conflict" : "missing_info",
    field: STORY_MACRO_FIELD_SET.has(item.field) ? (item.field as StoryMacroIssue["field"]) : "global",
    message: item.message.trim(),
  }));
}
