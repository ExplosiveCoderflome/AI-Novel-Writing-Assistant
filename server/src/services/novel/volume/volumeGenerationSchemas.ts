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
  openingHook: z.string().trim().min(1),
  mainPromise: z.string().trim().min(1),
  primaryPressureSource: z.string().trim().min(1),
  coreSellingPoint: z.string().trim().min(1),
  escalationMode: z.string().trim().min(1),
  protagonistChange: z.string().trim().min(1),
  midVolumeRisk: z.string().trim().min(1),
  climax: z.string().trim().min(1),
  payoffType: z.string().trim().min(1),
  nextVolumeHook: z.string().trim().min(1),
  resetPoint: z.string().trim().optional().nullable(),
  openPayoffs: z.array(z.string().trim().min(1)).default([]),
});

const generatedChapterListItemSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
});

const generatedVolumeStrategyVolumeSchema = z.object({
  sortOrder: z.number().int().min(1),
  planningMode: z.enum(["hard", "soft"]),
  roleLabel: z.string().trim().min(1),
  coreReward: z.string().trim().min(1),
  escalationFocus: z.string().trim().min(1),
  uncertaintyLevel: z.enum(["low", "medium", "high"]),
});

const generatedVolumeUncertaintySchema = z.object({
  targetType: z.enum(["book", "volume", "beat_sheet", "chapter_list"]),
  targetRef: z.string().trim().min(1),
  level: z.enum(["low", "medium", "high"]),
  reason: z.string().trim().min(1),
});

const generatedVolumeBeatSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  chapterSpanHint: z.string().trim().min(1),
  mustDeliver: z.array(z.string().trim().min(1)).min(1).max(6),
});

const generatedVolumeCritiqueIssueSchema = z.object({
  targetRef: z.string().trim().min(1),
  severity: z.enum(["low", "medium", "high"]),
  title: z.string().trim().min(1),
  detail: z.string().trim().min(1),
});

const generatedVolumeRebalanceDecisionSchema = z.object({
  anchorVolumeId: z.string().trim().min(1),
  affectedVolumeId: z.string().trim().min(1),
  direction: z.enum(["pull_forward", "push_back", "tighten_current", "expand_adjacent", "hold"]),
  severity: z.enum(["low", "medium", "high"]),
  summary: z.string().trim().min(1),
  actions: z.array(z.string().trim().min(1)).min(1).max(5),
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

export function createVolumeStrategySchema(maxVolumeCount = 12) {
  return z.object({
    recommendedVolumeCount: z.number().int().min(1).max(maxVolumeCount),
    hardPlannedVolumeCount: z.number().int().min(1).max(maxVolumeCount),
    readerRewardLadder: z.string().trim().min(1),
    escalationLadder: z.string().trim().min(1),
    midpointShift: z.string().trim().min(1),
    notes: z.string().trim().min(1),
    volumes: z.array(generatedVolumeStrategyVolumeSchema).min(1).max(maxVolumeCount),
    uncertainties: z.array(generatedVolumeUncertaintySchema).max(maxVolumeCount).default([]),
  }).superRefine((value, ctx) => {
    if (value.hardPlannedVolumeCount > value.recommendedVolumeCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["hardPlannedVolumeCount"],
        message: "hardPlannedVolumeCount 不能大于 recommendedVolumeCount。",
      });
    }

    if (value.volumes.length !== value.recommendedVolumeCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["volumes"],
        message: "volumes 数量必须与 recommendedVolumeCount 完全一致。",
      });
    }

    value.volumes.forEach((volume, index) => {
      const expectedSortOrder = index + 1;
      if (volume.sortOrder !== expectedSortOrder) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["volumes", index, "sortOrder"],
          message: `volumes[${index}].sortOrder 必须按 1..N 连续递增，当前应为 ${expectedSortOrder}。`,
        });
      }

      const expectedPlanningMode = index < value.hardPlannedVolumeCount ? "hard" : "soft";
      if (volume.planningMode !== expectedPlanningMode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["volumes", index, "planningMode"],
          message: `前 ${value.hardPlannedVolumeCount} 卷必须为 ${index < value.hardPlannedVolumeCount ? "\"hard\"" : "\"soft\""} 规划模式。`,
        });
      }
    });
  });
}

export function createVolumeStrategyCritiqueSchema() {
  return z.object({
    overallRisk: z.enum(["low", "medium", "high"]),
    summary: z.string().trim().min(1),
    issues: z.array(generatedVolumeCritiqueIssueSchema).max(12).default([]),
    recommendedActions: z.array(z.string().trim().min(1)).max(8).default([]),
  });
}

export function createVolumeBeatSheetSchema() {
  return z.object({
    beats: z.array(generatedVolumeBeatSchema).min(5).max(8),
  });
}

export function createVolumeRebalanceSchema() {
  return z.object({
    decisions: z.array(generatedVolumeRebalanceDecisionSchema).max(4).default([]),
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
