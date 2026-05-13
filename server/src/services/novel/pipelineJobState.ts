import type { PipelineJobStatus } from "@ai-novel/shared/types/novel";
import type {
  PipelineBackgroundSyncActivity,
  PipelineBackgroundSyncKind,
  PipelineBackgroundSyncState,
  PipelinePayload,
} from "./novelCoreShared";
import type { NovelControlPolicy } from "@ai-novel/shared/types/canonicalState";

const PIPELINE_ACTIVE_STAGES = ["queued", "generating_chapters", "reviewing", "repairing", "finalizing"] as const;
const PIPELINE_STAGE_PROGRESS = {
  queued: 0,
  generating_chapters: 0.2,
  reviewing: 0.65,
  repairing: 0.88,
  finalizing: 0.98,
} as const;

const PIPELINE_BACKGROUND_ACTIVITY_LABELS: Record<PipelineBackgroundSyncKind, string> = {
  character_dynamics: "角色成长中",
  state_snapshot: "状态同步中",
  payoff_ledger: "伏笔账本同步中",
  character_resources: "资源账本同步中",
  canonical_state: "全局状态同步中",
};

export const PIPELINE_QUALITY_NOTICE_CODE = "PIPELINE_QUALITY_REVIEW";
export const PIPELINE_REPLAN_NOTICE_CODE = "PIPELINE_REPLAN_REQUIRED";

export type PipelineActiveStage = (typeof PIPELINE_ACTIVE_STAGES)[number];

export interface PipelineJobLike {
  status: PipelineJobStatus;
  payload?: string | null;
}

export interface PipelineJobDecorations {
  displayStatus: string | null;
  noticeCode: string | null;
  noticeSummary: string | null;
  qualityAlertDetails: string[];
  recoverableRepairDetails: string[];
  backgroundActivityLabels: string[];
}

export type DecoratedPipelineJob<T extends PipelineJobLike> = T & PipelineJobDecorations;

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizePipelineBackgroundActivity(value: unknown): PipelineBackgroundSyncActivity | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const kind = raw.kind;
  const status = raw.status;
  if (
    (
      kind !== "character_dynamics"
      && kind !== "state_snapshot"
      && kind !== "payoff_ledger"
      && kind !== "character_resources"
      && kind !== "canonical_state"
    )
    || (status !== "running" && status !== "failed")
  ) {
    return null;
  }
  return {
    kind,
    status,
    chapterId: typeof raw.chapterId === "string" ? raw.chapterId : "",
    chapterOrder: typeof raw.chapterOrder === "number" ? raw.chapterOrder : undefined,
    chapterTitle: typeof raw.chapterTitle === "string" && raw.chapterTitle.trim()
      ? raw.chapterTitle.trim()
      : undefined,
    updatedAt: typeof raw.updatedAt === "string" && raw.updatedAt.trim()
      ? raw.updatedAt.trim()
      : new Date(0).toISOString(),
    error: typeof raw.error === "string" && raw.error.trim() ? raw.error.trim() : null,
  };
}

function normalizePipelineBackgroundSync(value: unknown): PipelineBackgroundSyncState | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const activities = Array.isArray(raw.activities)
    ? raw.activities
      .map((item) => normalizePipelineBackgroundActivity(item))
      .filter((item): item is PipelineBackgroundSyncActivity => Boolean(item))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    : [];
  return activities.length > 0 ? { activities } : undefined;
}

function normalizeControlPolicy(value: unknown): NovelControlPolicy | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const kickoffMode = raw.kickoffMode;
  const advanceMode = raw.advanceMode;
  if (
    (
      kickoffMode !== "manual_start"
      && kickoffMode !== "director_start"
      && kickoffMode !== "takeover_start"
    )
    || (
      advanceMode !== "manual"
      && advanceMode !== "stage_review"
      && advanceMode !== "auto_to_ready"
      && advanceMode !== "auto_to_execution"
      && advanceMode !== "full_book_autopilot"
    )
  ) {
    return undefined;
  }
  const reviewCheckpoints = Array.isArray(raw.reviewCheckpoints)
    ? raw.reviewCheckpoints
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
    : [];
  return {
    kickoffMode,
    advanceMode,
    reviewCheckpoints,
    ...(raw.autoExecutionRange && typeof raw.autoExecutionRange === "object"
      ? { autoExecutionRange: raw.autoExecutionRange as NovelControlPolicy["autoExecutionRange"] }
      : {}),
  };
}

export function buildPipelineBackgroundActivityLabels(
  backgroundSync: PipelineBackgroundSyncState | null | undefined,
): string[] {
  const activities = backgroundSync?.activities ?? [];
  if (activities.length === 0) {
    return [];
  }
  const labels = new Set<string>();
  for (const activity of activities) {
    if (activity.status !== "running") {
      continue;
    }
    const baseLabel = PIPELINE_BACKGROUND_ACTIVITY_LABELS[activity.kind];
    if (!baseLabel) {
      continue;
    }
    labels.add(
      typeof activity.chapterOrder === "number"
        ? `${baseLabel}(第${activity.chapterOrder}章)`
        : baseLabel,
    );
  }
  return Array.from(labels);
}

function clampPipelineProgress(value: number, stage: PipelineActiveStage): number {
  const max = stage === "finalizing" ? 0.999 : 0.995;
  return Number(Math.max(0, Math.min(max, value)).toFixed(4));
}

export function isPipelineActiveStage(value: string | null | undefined): value is PipelineActiveStage {
  return PIPELINE_ACTIVE_STAGES.includes((value ?? "") as PipelineActiveStage);
}

export function buildPipelineStageProgress(input: {
  completedCount: number;
  totalCount: number;
  stage: PipelineActiveStage;
}): number {
  if (input.totalCount <= 0) {
    return 0;
  }
  const completedBase = Math.max(0, input.completedCount) / input.totalCount;
  const stageFraction = PIPELINE_STAGE_PROGRESS[input.stage] ?? 0;
  return clampPipelineProgress(
    (Math.max(0, input.completedCount) + stageFraction) / input.totalCount,
    input.stage,
  ) || Number(completedBase.toFixed(4));
}

export function buildPipelineCurrentItemLabel(input: {
  completedCount: number;
  totalCount: number;
  chapterOrder?: number;
  title: string;
}): string {
  const currentIndex = Math.min(input.totalCount, Math.max(1, input.completedCount + 1));
  if (typeof input.chapterOrder === "number") {
    return `第${input.chapterOrder}章 · ${input.title.trim()} · 批次 ${currentIndex}/${input.totalCount}`;
  }
  return `第 ${currentIndex}/${input.totalCount} 章 · ${input.title.trim()}`;
}

export function parsePipelinePayload(payload: string | null | undefined): PipelinePayload {
  if (!payload?.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    return {
      provider: typeof parsed.provider === "string" ? (parsed.provider as PipelinePayload["provider"]) : undefined,
      model: typeof parsed.model === "string" ? parsed.model : undefined,
      temperature: typeof parsed.temperature === "number" ? parsed.temperature : undefined,
      workflowTaskId: typeof parsed.workflowTaskId === "string" ? parsed.workflowTaskId : undefined,
      taskStyleProfileId: typeof parsed.taskStyleProfileId === "string" ? parsed.taskStyleProfileId : undefined,
      maxRetries: typeof parsed.maxRetries === "number" ? parsed.maxRetries : undefined,
      runMode: parsed.runMode === "polish" ? "polish" : parsed.runMode === "fast" ? "fast" : undefined,
      autoReview: typeof parsed.autoReview === "boolean" ? parsed.autoReview : undefined,
      autoRepair: typeof parsed.autoRepair === "boolean" ? parsed.autoRepair : undefined,
      skipCompleted: typeof parsed.skipCompleted === "boolean" ? parsed.skipCompleted : undefined,
      qualityThreshold: typeof parsed.qualityThreshold === "number" ? parsed.qualityThreshold : undefined,
      repairMode:
        parsed.repairMode === "detect_only"
        || parsed.repairMode === "light_repair"
        || parsed.repairMode === "heavy_repair"
        || parsed.repairMode === "continuity_only"
        || parsed.repairMode === "character_only"
        || parsed.repairMode === "ending_only"
          ? parsed.repairMode
          : undefined,
      controlPolicy: normalizeControlPolicy(parsed.controlPolicy),
      qualityAlertDetails: normalizeStringList(parsed.qualityAlertDetails ?? parsed.failedDetails),
      replanAlertDetails: normalizeStringList(parsed.replanAlertDetails),
      recoverableRepairDetails: normalizeStringList(parsed.recoverableRepairDetails),
      backgroundSync: normalizePipelineBackgroundSync(parsed.backgroundSync),
    };
  } catch {
    return {};
  }
}

export function stringifyPipelinePayload(input: PipelinePayload): string {
  const qualityAlertDetails = normalizeStringList(input.qualityAlertDetails) ?? [];
  const replanAlertDetails = normalizeStringList(input.replanAlertDetails) ?? [];
  const recoverableRepairDetails = normalizeStringList(input.recoverableRepairDetails) ?? [];
  const backgroundSync = normalizePipelineBackgroundSync(input.backgroundSync);
  return JSON.stringify({
    provider: input.provider ?? "deepseek",
    model: input.model ?? "",
    temperature: input.temperature ?? 0.8,
    ...(input.workflowTaskId?.trim() ? { workflowTaskId: input.workflowTaskId.trim() } : {}),
    ...(input.taskStyleProfileId?.trim() ? { taskStyleProfileId: input.taskStyleProfileId.trim() } : {}),
    ...(typeof input.maxRetries === "number" ? { maxRetries: input.maxRetries } : {}),
    runMode: input.runMode ?? "fast",
    autoReview: input.autoReview ?? true,
    autoRepair: input.autoRepair ?? true,
    skipCompleted: input.skipCompleted ?? true,
    qualityThreshold: input.qualityThreshold ?? null,
    repairMode: input.repairMode ?? "light_repair",
    ...(input.controlPolicy ? { controlPolicy: normalizeControlPolicy(input.controlPolicy) ?? input.controlPolicy } : {}),
    ...(qualityAlertDetails.length > 0 ? { qualityAlertDetails } : {}),
    ...(replanAlertDetails.length > 0 ? { replanAlertDetails } : {}),
    ...(recoverableRepairDetails.length > 0 ? { recoverableRepairDetails } : {}),
    ...(backgroundSync?.activities?.length ? { backgroundSync } : {}),
  });
}

export function getPipelineQualityNotice(
  details: string[] | undefined,
  repairDetails?: string[] | undefined,
): PipelineJobDecorations {
  const qualityAlertDetails = normalizeStringList(details) ?? [];
  const recoverableRepairDetails = normalizeStringList(repairDetails) ?? [];
  if (qualityAlertDetails.length === 0 && recoverableRepairDetails.length === 0) {
    return {
      displayStatus: null,
      noticeCode: null,
      noticeSummary: null,
      qualityAlertDetails: [],
      recoverableRepairDetails: [],
      backgroundActivityLabels: [],
    };
  }
  return {
    displayStatus: "Completed with quality alerts",
    noticeCode: PIPELINE_QUALITY_NOTICE_CODE,
    noticeSummary: [
      qualityAlertDetails.length > 0 ? `部分章节未通过质量阈值：${qualityAlertDetails.join("; ")}` : null,
      recoverableRepairDetails.length > 0 ? `部分章节保留正文并记录待修复：${recoverableRepairDetails.join("; ")}` : null,
    ].filter(Boolean).join("。"),
    qualityAlertDetails,
    recoverableRepairDetails,
    backgroundActivityLabels: [],
  };
}

export function getPipelineReplanNotice(details: string[] | undefined): PipelineJobDecorations {
  const replanAlertDetails = normalizeStringList(details) ?? [];
  if (replanAlertDetails.length === 0) {
    return {
      displayStatus: null,
      noticeCode: null,
      noticeSummary: null,
      qualityAlertDetails: [],
      recoverableRepairDetails: [],
      backgroundActivityLabels: [],
    };
  }
  return {
    displayStatus: "Completed with replan required",
    noticeCode: PIPELINE_REPLAN_NOTICE_CODE,
    noticeSummary: `State-driven replan is required before continuing: ${replanAlertDetails.join("; ")}`,
    qualityAlertDetails: [],
    recoverableRepairDetails: [],
    backgroundActivityLabels: [],
  };
}

export function decoratePipelineJob<T extends PipelineJobLike>(job: T): DecoratedPipelineJob<T> {
  const payload = parsePipelinePayload(job.payload);
  const qualityNotice = getPipelineQualityNotice(payload.qualityAlertDetails, payload.recoverableRepairDetails);
  const notice = job.status === "succeeded"
    ? (getPipelineReplanNotice(payload.replanAlertDetails).noticeCode
      ? getPipelineReplanNotice(payload.replanAlertDetails)
      : qualityNotice)
    : qualityNotice.noticeSummary
      ? {
        ...qualityNotice,
        displayStatus: "Failed with generation alerts",
      }
    : {
      displayStatus: null,
      noticeCode: null,
      noticeSummary: null,
      qualityAlertDetails: payload.qualityAlertDetails ?? [],
      recoverableRepairDetails: payload.recoverableRepairDetails ?? [],
      backgroundActivityLabels: [],
    };
  return {
    ...job,
    displayStatus: notice.displayStatus,
    noticeCode: notice.noticeCode,
    noticeSummary: notice.noticeSummary,
    qualityAlertDetails: notice.qualityAlertDetails,
    recoverableRepairDetails: notice.recoverableRepairDetails,
    backgroundActivityLabels: buildPipelineBackgroundActivityLabels(payload.backgroundSync),
  };
}
