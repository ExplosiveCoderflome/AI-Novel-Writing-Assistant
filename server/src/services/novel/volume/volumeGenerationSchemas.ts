import { z } from "zod";
import type { VolumeCountRange } from "@ai-novel/shared/types/novel";
import {
  getVolumeBeatSlot,
  getVolumeBeatRoleLabel,
  isVolumeBeatSlotKey,
  listMissingRequiredVolumeBeatKeys,
  resolveVolumeBeatSlotKey,
  VOLUME_BEAT_OPTIONAL_SLOT_KEYS,
  VOLUME_BEAT_REQUIRED_SLOT_KEYS,
  VOLUME_BEAT_SLOT_DEFINITIONS,
} from "@ai-novel/shared/types/volumeBeatSlots";
import { MAX_VOLUME_COUNT } from "@ai-novel/shared/types/volumePlanning";

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

function normalizeTextValue(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.round(value));
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeVolumeReference(value: unknown): unknown {
  const normalized = normalizeTextValue(value);
  if (!normalized) {
    return value;
  }
  const volumeMatch = normalized.match(/(?:volume|卷|第)?\s*(\d+)(?:\s*卷)?$/i);
  return volumeMatch?.[1] ?? normalized;
}

function normalizeRebalanceSeverity(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  if (normalized === "urgent" || normalized === "critical") {
    return "high";
  }
  if (normalized === "mid") {
    return "medium";
  }
  if (normalized === "minor") {
    return "low";
  }
  return value;
}

function normalizeRebalanceDirection(value: unknown, actions?: unknown): unknown {
  const normalizedActions = normalizeStringArray(actions);
  const normalizedActionList = Array.isArray(normalizedActions)
    ? normalizedActions.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
    : [];

  if (normalizedActionList.length === 1 && normalizedActionList[0] === "hold") {
    return "hold";
  }

  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  switch (normalized) {
    case "pull_forward":
    case "pullforward":
    case "backward":
    case "back":
      return "pull_forward";
    case "push_back":
    case "pushback":
    case "forward":
    case "next":
      return "push_back";
    case "tighten_current":
    case "tighten":
    case "compress_current":
      return "tighten_current";
    case "expand_adjacent":
    case "expand":
    case "expand_neighbor":
    case "expand_neighbour":
    case "adjacent":
      return "expand_adjacent";
    case "hold":
    case "no_change":
    case "none":
    case "stable":
      return "hold";
    default:
      return value;
  }
}

function normalizeBeatPayload(raw: unknown): unknown {
  const normalized = normalizeObjectAlias(raw, {
    key: ["beatKey", "stageKey", "id", "slot", "slotKey", "roleKey"],
    label: ["beatLabel", "stageLabel", "roleLabel", "职能", "节奏职能"],
    title: ["shortTitle", "customTitle", "displayTitle", "name", "短标题", "本卷标题"],
    summary: ["beatSummary", "description", "detail", "content", "摘要", "概要", "说明"],
    chapterSpanHint: [
      "chapterSpan",
      "chapterRange",
      "chapterWindow",
      "chapterHint",
      "spanHint",
      "chapter_span_hint",
      "章节范围",
      "章数范围",
    ],
    mustDeliver: [
      "deliverables",
      "mustHit",
      "mustLand",
      "requiredPayoffs",
      "requiredPoints",
      "payoffs",
      "deliver",
      "must_deliver",
      "关键兑现",
      "必要兑现",
    ],
  });

  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return normalized;
  }

  const record = normalized as Record<string, unknown>;
  const rawKey = typeof record.key === "string" ? record.key : "";
  const rawLabel = typeof record.label === "string" ? record.label : "";
  const rawTitle = typeof record.title === "string" ? record.title.trim() : "";
  const resolvedKey = resolveVolumeBeatSlotKey(rawKey) ?? resolveVolumeBeatSlotKey(rawLabel);
  const roleLabel = resolvedKey
    ? getVolumeBeatRoleLabel(resolvedKey)
    : (rawLabel.trim() || "节奏段");
  const slot = resolvedKey ? getVolumeBeatSlot(resolvedKey) : null;
  const aliasTokens = new Set(
    [roleLabel, ...(slot?.aliases ?? [])]
      .map((item) => item.trim().toLowerCase().replace(/[\s_\-·・]+/g, ""))
      .filter(Boolean),
  );
  let title = rawTitle;
  if (!title && rawLabel.trim() && rawLabel.trim() !== roleLabel) {
    const prefix = `${roleLabel} · `;
    const candidate = rawLabel.trim().startsWith(prefix)
      ? rawLabel.trim().slice(prefix.length).trim()
      : rawLabel.trim();
    const candidateToken = candidate.toLowerCase().replace(/[\s_\-·・]+/g, "");
    if (!aliasTokens.has(candidateToken)) {
      title = candidate;
    }
  }
  if (title === roleLabel || aliasTokens.has(title.toLowerCase().replace(/[\s_\-·・]+/g, ""))) {
    title = "";
  }

  return {
    ...record,
    key: resolvedKey ?? rawKey.trim(),
    label: roleLabel,
    title: title || null,
    mustDeliver: normalizeStringArray(record.mustDeliver),
  };
}

function normalizeChapterListItemPayload(raw: unknown, expectedBeatKey?: string): unknown {
  const normalized = normalizeObjectAlias(raw, {
    title: ["chapterTitle", "name"],
    summary: ["description", "content", "outline"],
    beatKey: ["beat", "beat_key", "stageKey", "stage_key"],
  });
  if (
    expectedBeatKey
    && normalized
    && typeof normalized === "object"
    && !Array.isArray(normalized)
    && (normalized as Record<string, unknown>).beatKey == null
  ) {
    return {
      ...normalized as Record<string, unknown>,
      beatKey: expectedBeatKey,
    };
  }
  return normalized;
}

function normalizeChapterBeatBlockPayload(
  raw: unknown,
  config: {
    expectedBeatKey?: string;
    expectedBeatLabel?: string | null;
  } = {},
): unknown {
  const expectedBeatLabel = config.expectedBeatLabel?.trim();
  if (Array.isArray(raw) && config.expectedBeatKey && expectedBeatLabel) {
    return {
      beatKey: config.expectedBeatKey,
      beatLabel: expectedBeatLabel,
      chapterCount: raw.length,
      chapters: raw.map((item) => normalizeChapterListItemPayload(item, config.expectedBeatKey)),
    };
  }

  const normalized = normalizeObjectAlias(raw, {
    beatKey: ["beat", "beat_key", "stageKey", "stage_key"],
    beatLabel: ["label", "beat", "beat_label", "stageLabel", "stage_label", "name", "title"],
    chapterCount: ["count", "chapter_count", "chapterTotal", "chapter_total"],
    chapters: ["items", "chapterList", "chapter_list"],
  });

  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return normalized;
  }

  const record = normalized as Record<string, unknown>;
  return {
    ...record,
    chapterCount: normalizeInteger(record.chapterCount),
    chapters: Array.isArray(record.chapters)
      ? record.chapters.map((item) => normalizeChapterListItemPayload(item, config.expectedBeatKey))
      : record.chapters,
  };
}

function normalizeBeatSheetPayload(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    return { beats: raw };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const record = raw as Record<string, unknown>;
  const candidates = [
    record.beats,
    record.items,
    record.stages,
    record.outline,
    record.beatSheet,
  ];

  let beats = record.beats;
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      beats = candidate;
      break;
    }
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const nestedBeats = (candidate as { beats?: unknown }).beats;
      if (Array.isArray(nestedBeats)) {
        beats = nestedBeats;
        break;
      }
    }
  }

  return {
    ...record,
    beats,
  };
}

function normalizeRebalanceDecisionPayload(raw: unknown): unknown {
  const normalized = normalizeObjectAlias(raw, {
    anchorVolumeId: ["anchorVolume", "anchorVolumeOrder", "anchorVolumeRef", "sourceVolumeId", "sourceVolumeOrder"],
    affectedVolumeId: ["affectedVolume", "affectedVolumeOrder", "affectedVolumeRef", "adjacentVolumeId", "adjacentVolumeOrder", "targetVolumeId", "targetVolumeOrder", "neighborVolumeId", "neighborVolumeOrder"],
    direction: ["rebalanceDirection", "adjustDirection", "moveDirection"],
    severity: ["impactLevel", "priority", "risk"],
    summary: ["reason", "detail", "explanation"],
    actions: ["recommendedActions", "actionItems", "suggestedActions", "recommendations"],
  });

  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return normalized;
  }

  const record = normalized as Record<string, unknown>;
  const normalizedDirection = normalizeRebalanceDirection(record.direction, record.actions);
  const normalizedActions = normalizeStringArray(record.actions);
  const fallbackActions = Array.isArray(normalizedActions) && normalizedActions.length > 0
    ? normalizedActions
    : normalizedDirection === "hold"
      ? ["hold"]
      : normalizedActions;
  return {
    ...record,
    anchorVolumeId: normalizeVolumeReference(record.anchorVolumeId),
    affectedVolumeId: normalizeVolumeReference(record.affectedVolumeId),
    direction: normalizedDirection,
    severity: normalizeRebalanceSeverity(record.severity),
    actions: fallbackActions,
  };
}

function normalizeRebalancePayload(raw: unknown): unknown {
  if (Array.isArray(raw)) {
    return { decisions: raw };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const record = raw as Record<string, unknown>;
  const candidates = [
    record.decisions,
    record.items,
    record.recommendations,
    record.rebalanceDecisions,
  ];

  let decisions = record.decisions;
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      decisions = candidate;
      break;
    }
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const nestedDecisions = (candidate as { decisions?: unknown }).decisions;
      if (Array.isArray(nestedDecisions)) {
        decisions = nestedDecisions;
        break;
      }
    }
  }

  return {
    ...record,
    decisions,
  };
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

const generatedChapterBeatBlockItemSchema = z.preprocess((raw) => normalizeChapterListItemPayload(raw), z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  beatKey: z.string().trim().min(1),
}));

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

const volumeBeatSlotKeySchema = z.enum([
  ...VOLUME_BEAT_REQUIRED_SLOT_KEYS,
  ...VOLUME_BEAT_OPTIONAL_SLOT_KEYS,
]);

const generatedVolumeBeatSchema = z.preprocess(normalizeBeatPayload, z.object({
  key: volumeBeatSlotKeySchema,
  label: z.string().trim().min(1),
  title: z.string().trim().min(1).max(16).nullable().optional(),
  summary: z.string().trim().min(1),
  chapterSpanHint: z.string().trim().min(1),
  mustDeliver: z.array(z.string().trim().min(1)).min(1).max(6),
}));

const generatedVolumeCritiqueIssueSchema = z.object({
  targetRef: z.string().trim().min(1),
  severity: z.enum(["low", "medium", "high"]),
  title: z.string().trim().min(1),
  detail: z.string().trim().min(1),
});

const generatedVolumeRebalanceDecisionSchema = z.preprocess(normalizeRebalanceDecisionPayload, z.object({
  anchorVolumeId: z.string().trim().min(1),
  affectedVolumeId: z.string().trim().min(1),
  direction: z.enum(["pull_forward", "push_back", "tighten_current", "expand_adjacent", "hold"]),
  severity: z.enum(["low", "medium", "high"]),
  summary: z.string().trim().min(1),
  actions: z.array(z.string().trim().min(1)).min(1).max(5),
}));

export function createBookVolumeSkeletonSchema(exactVolumeCount?: number) {
  return z.object({
    volumes: typeof exactVolumeCount === "number"
      ? z.array(generatedVolumeSkeletonSchema).length(exactVolumeCount)
      : z.array(generatedVolumeSkeletonSchema).min(1).max(MAX_VOLUME_COUNT),
  });
}

export function createVolumeChapterListSchema(exactChapterCount?: number) {
  return z.object({
    chapters: typeof exactChapterCount === "number"
      ? z.array(generatedChapterListItemSchema).length(exactChapterCount)
      : z.array(generatedChapterListItemSchema).min(1).max(80),
  });
}

export function createVolumeChapterBeatBlockSchema(config: {
  exactChapterCount?: number;
  expectedBeatKey?: string;
  expectedBeatLabel?: string | null;
} = {}) {
  const { exactChapterCount, expectedBeatKey, expectedBeatLabel } = config;
  return z.preprocess(
    (raw) => normalizeChapterBeatBlockPayload(raw, { expectedBeatKey, expectedBeatLabel }),
    z.object({
    beatKey: z.string().trim().min(1),
    beatLabel: z.string().trim().min(1),
    chapterCount: z.number().int().min(1),
    chapters: typeof exactChapterCount === "number"
      ? z.array(generatedChapterBeatBlockItemSchema).length(exactChapterCount)
      : z.array(generatedChapterBeatBlockItemSchema).min(1).max(24),
  }).superRefine((value, ctx) => {
    if (value.chapterCount !== value.chapters.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["chapterCount"],
        message: "chapterCount 必须与 chapters.length 完全一致。",
      });
    }
    if (expectedBeatKey && value.beatKey !== expectedBeatKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["beatKey"],
        message: `beatKey 必须严格等于 ${expectedBeatKey}。`,
      });
    }
    if (expectedBeatLabel && value.beatLabel !== expectedBeatLabel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["beatLabel"],
        message: `beatLabel 必须严格等于 ${expectedBeatLabel}。`,
      });
    }
    if (expectedBeatKey) {
      value.chapters.forEach((chapter, index) => {
        if (chapter.beatKey !== expectedBeatKey) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["chapters", index, "beatKey"],
            message: `第 ${index + 1} 条章节的 beatKey 必须严格等于 ${expectedBeatKey}。`,
          });
        }
      });
    }
  }));
}

export function createVolumeStrategySchema(config: {
  maxVolumeCount?: number;
  allowedVolumeCountRange?: VolumeCountRange | null;
  decisionVolumeCountRange?: VolumeCountRange | null;
  fixedRecommendedVolumeCount?: number | null;
  hardPlannedVolumeRange?: VolumeCountRange | null;
} = {}) {
  const maxVolumeCount = config.maxVolumeCount ?? MAX_VOLUME_COUNT;
  const allowedVolumeCountRange = config.allowedVolumeCountRange ?? {
    min: 1,
    max: maxVolumeCount,
  };
  const decisionVolumeCountRange = config.decisionVolumeCountRange ?? allowedVolumeCountRange;
  const fixedRecommendedVolumeCount = typeof config.fixedRecommendedVolumeCount === "number"
    ? config.fixedRecommendedVolumeCount
    : null;
  const hardPlannedVolumeRange = config.hardPlannedVolumeRange ?? {
    min: 1,
    max: maxVolumeCount,
  };
  const recommendedVolumeCountRange = fixedRecommendedVolumeCount === null
    ? decisionVolumeCountRange
    : allowedVolumeCountRange;

  return z.object({
    recommendedVolumeCount: z.number().int().min(recommendedVolumeCountRange.min).max(recommendedVolumeCountRange.max),
    hardPlannedVolumeCount: z.number().int().min(hardPlannedVolumeRange.min).max(hardPlannedVolumeRange.max),
    readerRewardLadder: z.string().trim().min(1),
    escalationLadder: z.string().trim().min(1),
    midpointShift: z.string().trim().min(1),
    notes: z.string().trim().min(1),
    volumes: z.array(generatedVolumeStrategyVolumeSchema).min(1).max(maxVolumeCount),
    uncertainties: z.array(generatedVolumeUncertaintySchema).max(maxVolumeCount).default([]),
  }).superRefine((value, ctx) => {
    if (fixedRecommendedVolumeCount !== null && value.recommendedVolumeCount !== fixedRecommendedVolumeCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recommendedVolumeCount"],
        message: `recommendedVolumeCount 必须严格等于 ${fixedRecommendedVolumeCount}。`,
      });
    }

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
    issues: z.array(generatedVolumeCritiqueIssueSchema).max(MAX_VOLUME_COUNT).default([]),
    recommendedActions: z.array(z.string().trim().min(1)).max(8).default([]),
  });
}

export function createVolumeBeatSheetSchema() {
  return z.preprocess(normalizeBeatSheetPayload, z.object({
    beats: z.array(generatedVolumeBeatSchema).min(6).max(8),
  }).superRefine((value, ctx) => {
    const keys = value.beats.map((beat) => beat.key);
    const missingRequired = listMissingRequiredVolumeBeatKeys(keys);
    if (missingRequired.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["beats"],
        message: `节奏板缺少必需职能：${missingRequired.map((key) => getVolumeBeatRoleLabel(key)).join("、")}。`,
      });
    }

    const seen = new Set<string>();
    value.beats.forEach((beat, index) => {
      if (seen.has(beat.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["beats", index, "key"],
          message: `节奏职能 key 重复：${beat.key}。`,
        });
      }
      seen.add(beat.key);

      const expectedLabel = getVolumeBeatRoleLabel(beat.key);
      if (beat.label !== expectedLabel) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["beats", index, "label"],
          message: `beats[${index}].label 必须是稳定职能名「${expectedLabel}」。`,
        });
      }

      if (!isVolumeBeatSlotKey(beat.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["beats", index, "key"],
          message: `beats[${index}].key 必须是受支持的节奏职能 key。`,
        });
      }
    });

    const orderByKey = new Map(VOLUME_BEAT_SLOT_DEFINITIONS.map((slot) => [slot.key, slot.order]));
    for (let index = 1; index < value.beats.length; index += 1) {
      const previousOrder = orderByKey.get(value.beats[index - 1].key) ?? 0;
      const currentOrder = orderByKey.get(value.beats[index].key) ?? 0;
      if (currentOrder < previousOrder) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["beats", index, "key"],
          message: "节奏职能顺序必须按开卷到卷尾推进，不能前后颠倒。",
        });
        break;
      }
    }
  }));
}

export function createVolumeRebalanceSchema() {
  return z.preprocess(normalizeRebalancePayload, z.object({
    decisions: z.array(generatedVolumeRebalanceDecisionSchema).max(4).default([]),
  }));
}

export {
  createChapterBoundarySchema,
  createChapterExecutionContractSchema,
  createChapterPurposeSchema,
  createChapterTaskSheetSchema,
} from "./chapterDetail/chapterDetailSchemas";
