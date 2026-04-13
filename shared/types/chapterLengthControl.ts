import { z } from "zod";

const SCENE_COUNT_MIN = 3;
const SCENE_COUNT_MAX = 8;

export const lengthBudgetContractSchema = z.object({
  targetWordCount: z.number().int().positive(),
  softMinWordCount: z.number().int().positive(),
  softMaxWordCount: z.number().int().positive(),
  hardMaxWordCount: z.number().int().positive(),
});

export const chapterSceneCardSchema = z.object({
  key: z.string().trim().min(1),
  title: z.string().trim().min(1),
  purpose: z.string().trim().min(1),
  mustAdvance: z.array(z.string().trim().min(1)).default([]),
  mustPreserve: z.array(z.string().trim().min(1)).default([]),
  entryState: z.string().trim().min(1),
  exitState: z.string().trim().min(1),
  forbiddenExpansion: z.array(z.string().trim().min(1)).default([]),
  targetWordCount: z.number().int().positive(),
});

export const chapterScenePlanSchema = z.object({
  targetWordCount: z.number().int().positive(),
  lengthBudget: lengthBudgetContractSchema,
  scenes: z.array(chapterSceneCardSchema).min(SCENE_COUNT_MIN).max(SCENE_COUNT_MAX),
});

export type LengthBudgetContract = z.infer<typeof lengthBudgetContractSchema>;
export type ChapterSceneCard = z.infer<typeof chapterSceneCardSchema>;
export type ChapterScenePlan = z.infer<typeof chapterScenePlanSchema>;

type LooseRecord = Record<string, unknown>;

function isRecord(value: unknown): value is LooseRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.round(value));
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeText(item))
      .filter((item): item is string => Boolean(item));
  }
  if (typeof value === "string") {
    return value
      .split(/[\n,，;；、|]/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }
  return null;
}

function readAlias(record: LooseRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return undefined;
}

function normalizeSceneCardInput(raw: unknown, index: number): ChapterSceneCard | null {
  if (!isRecord(raw)) {
    return null;
  }

  const targetWordCount = normalizeInteger(readAlias(raw, [
    "targetWordCount",
    "target_word_count",
    "targetWords",
    "wordCount",
    "budget",
    "字数",
  ]));
  const key = normalizeText(readAlias(raw, [
    "key",
    "sceneKey",
    "id",
  ])) ?? `scene_${index + 1}`;
  const title = normalizeText(readAlias(raw, [
    "title",
    "sceneTitle",
    "label",
    "name",
  ]));
  const purpose = normalizeText(readAlias(raw, [
    "purpose",
    "objective",
    "goal",
    "summary",
  ]));
  const entryState = normalizeText(readAlias(raw, [
    "entryState",
    "startState",
    "sceneEntry",
    "openingState",
  ]));
  const exitState = normalizeText(readAlias(raw, [
    "exitState",
    "endState",
    "sceneExit",
    "closingState",
  ]));

  if (!title || !purpose || !entryState || !exitState || !targetWordCount || targetWordCount <= 0) {
    return null;
  }

  return chapterSceneCardSchema.parse({
    key,
    title,
    purpose,
    mustAdvance: normalizeStringArray(readAlias(raw, [
      "mustAdvance",
      "mustAdvanceItems",
      "advanceItems",
      "deliverables",
    ])),
    mustPreserve: normalizeStringArray(readAlias(raw, [
      "mustPreserve",
      "mustPreserveItems",
      "preserveItems",
      "guardrails",
    ])),
    entryState,
    exitState,
    forbiddenExpansion: normalizeStringArray(readAlias(raw, [
      "forbiddenExpansion",
      "forbiddenExpansions",
      "mustAvoid",
      "forbidden",
    ])),
    targetWordCount,
  });
}

function rescaleSceneTargets(targetWordCount: number, scenes: ChapterSceneCard[]): ChapterSceneCard[] {
  const rawTotal = scenes.reduce((sum, scene) => sum + scene.targetWordCount, 0);
  if (rawTotal <= 0) {
    throw new Error("Scene target word count total must be positive.");
  }

  const scaled = scenes.map((scene) => ({
    ...scene,
    targetWordCount: Math.max(1, Math.floor((scene.targetWordCount * targetWordCount) / rawTotal)),
  }));
  let delta = targetWordCount - scaled.reduce((sum, scene) => sum + scene.targetWordCount, 0);
  const ordered = scaled
    .map((scene, index) => ({ scene, index }))
    .sort((left, right) => right.scene.targetWordCount - left.scene.targetWordCount || left.index - right.index);

  let cursor = 0;
  while (delta !== 0 && ordered.length > 0) {
    const target = ordered[cursor % ordered.length]?.scene;
    if (!target) {
      break;
    }
    if (delta < 0 && target.targetWordCount <= 1) {
      cursor += 1;
      continue;
    }
    target.targetWordCount += delta > 0 ? 1 : -1;
    delta += delta > 0 ? -1 : 1;
    cursor += 1;
  }

  return scaled.map((scene) => chapterSceneCardSchema.parse(scene));
}

export function resolveLengthBudgetContract(targetWordCount: number | null | undefined): LengthBudgetContract | null {
  if (!Number.isFinite(targetWordCount) || (targetWordCount ?? 0) <= 0) {
    return null;
  }
  const normalizedTarget = Math.round(targetWordCount as number);
  return {
    targetWordCount: normalizedTarget,
    softMinWordCount: Math.floor(normalizedTarget * 0.85),
    softMaxWordCount: Math.ceil(normalizedTarget * 1.15),
    hardMaxWordCount: Math.ceil(normalizedTarget * 1.25),
  };
}

export function normalizeChapterScenePlan(
  raw: unknown,
  targetWordCount: number | null | undefined,
): ChapterScenePlan {
  const budget = resolveLengthBudgetContract(targetWordCount);
  if (!budget) {
    throw new Error("Target word count is required to normalize chapter scene plan.");
  }

  const record = isRecord(raw) ? raw : null;
  const scenesRaw = Array.isArray(raw)
    ? raw
    : Array.isArray(record?.scenes)
      ? record.scenes
      : Array.isArray(record?.sceneCards)
        ? record.sceneCards
        : Array.isArray(record?.scenePlan)
          ? record.scenePlan
          : [];
  const normalizedScenes = scenesRaw
    .map((scene, index) => normalizeSceneCardInput(scene, index))
    .filter((scene): scene is ChapterSceneCard => Boolean(scene));

  if (normalizedScenes.length < SCENE_COUNT_MIN) {
    throw new Error("Scene count below minimum.");
  }

  const boundedScenes = normalizedScenes.slice(0, SCENE_COUNT_MAX);
  return chapterScenePlanSchema.parse({
    targetWordCount: budget.targetWordCount,
    lengthBudget: budget,
    scenes: rescaleSceneTargets(budget.targetWordCount, boundedScenes),
  });
}

export function parseChapterScenePlan(
  raw: unknown,
  options: { targetWordCount?: number | null } = {},
): ChapterScenePlan | null {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) as unknown : raw;
    if (options.targetWordCount != null) {
      return normalizeChapterScenePlan(parsed, options.targetWordCount);
    }
    return chapterScenePlanSchema.parse(parsed);
  } catch {
    return null;
  }
}

export function isCanonicalChapterScenePlan(
  raw: unknown,
  options: { targetWordCount?: number | null } = {},
): boolean {
  return Boolean(parseChapterScenePlan(raw, options));
}

export function serializeChapterScenePlan(plan: ChapterScenePlan): string {
  return JSON.stringify(chapterScenePlanSchema.parse(plan));
}
