import { z } from "zod";

function normalizeObjectAlias(raw: unknown, aliasMap: Record<string, string[]>): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }
  const record = raw as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...record };

  for (const [targetKey, aliases] of Object.entries(aliasMap)) {
    if (normalized[targetKey] !== undefined && normalized[targetKey] !== null) {
      continue;
    }
    const matchedAlias = aliases.find((alias) => record[alias] !== undefined && record[alias] !== null);
    if (matchedAlias) {
      normalized[targetKey] = record[matchedAlias];
    }
  }

  return normalized;
}

function normalizeInteger(value: unknown): unknown {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }
  return value;
}

function normalizeStringArray(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    return value
      .split(/[\n,，;；、|]/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value;
}

const generatedVolumeSkeletonSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().optional().nullable(),
  mainPromise: z.string().trim().min(1),
  escalationMode: z.string().trim().min(1),
  protagonistChange: z.string().trim().min(1),
  climax: z.string().trim().min(1),
  nextVolumeHook: z.string().trim().min(1),
  resetPoint: z.string().trim().optional().nullable(),
  openPayoffs: z.array(z.string().trim().min(1)).default([]),
});

const generatedChapterListItemSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
});

export function createBookVolumeSkeletonSchema(exactVolumeCount?: number) {
  return z.object({
    volumes: typeof exactVolumeCount === "number"
      ? z.array(generatedVolumeSkeletonSchema).length(exactVolumeCount)
      : z.array(generatedVolumeSkeletonSchema).min(1).max(12),
  });
}

export function createVolumeChapterListSchema(exactChapterCount?: number) {
  return z.object({
    chapters: typeof exactChapterCount === "number"
      ? z.array(generatedChapterListItemSchema).length(exactChapterCount)
      : z.array(generatedChapterListItemSchema).min(1).max(80),
  });
}

export function createChapterPurposeSchema() {
  return z.preprocess(
    (raw) => normalizeObjectAlias(raw, {
      purpose: ["章节目标", "chapterGoal", "goal", "objective"],
    }),
    z.object({
      purpose: z.string().trim().min(1),
    }),
  );
}

export function createChapterBoundarySchema() {
  return z.preprocess((raw) => {
    const normalized = normalizeObjectAlias(raw, {
      conflictLevel: ["冲突等级", "conflict_level", "conflict"],
      revealLevel: ["揭露等级", "reveal_level", "reveal"],
      targetWordCount: ["目标字数", "target_word_count", "wordCount", "字数"],
      mustAvoid: ["禁止事项", "避免事项", "must_avoid"],
      payoffRefs: ["兑现关联", "payoff_refs", "payoffs", "关联兑现"],
    });
    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
      return normalized;
    }
    const record = normalized as Record<string, unknown>;
    return {
      ...record,
      conflictLevel: normalizeInteger(record.conflictLevel),
      revealLevel: normalizeInteger(record.revealLevel),
      targetWordCount: normalizeInteger(record.targetWordCount),
      payoffRefs: normalizeStringArray(record.payoffRefs),
    };
  }, z.object({
    conflictLevel: z.number().int().min(0).max(100),
    revealLevel: z.number().int().min(0).max(100),
    targetWordCount: z.number().int().min(200).max(20000),
    mustAvoid: z.string().trim().min(1),
    payoffRefs: z.array(z.string().trim().min(1)).default([]),
  }));
}

export function createChapterTaskSheetSchema() {
  return z.preprocess(
    (raw) => normalizeObjectAlias(raw, {
      taskSheet: ["任务单", "task_sheet", "writingTask", "执行任务单"],
    }),
    z.object({
      taskSheet: z.string().trim().min(1),
    }),
  );
}
