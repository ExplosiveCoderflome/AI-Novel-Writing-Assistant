import type { PipelineJobStatus } from "@ai-novel/shared/types/novel";
import type {
  PipelineBackgroundSyncActivity,
  PipelineBackgroundSyncKind,
  PipelineBackgroundSyncState,
  PipelinePayload,
} from "./novelCoreShared";

const PIPELINE_ACTIVE_STAGES = ["queued", "generating_chapters", "reviewing", "repairing", "finalizing"] as const;
const PIPELINE_STAGE_PROGRESS = {
  queued: 0,
  generating_chapters: 0.2,
  reviewing: 0.65,
  repairing: 0.88,
  finalizing: 0.98,
} as const;

export const PIPELINE_QUALITY_NOTICE_CODE = "PIPELINE_QUALITY_REVIEW";

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

const PIPELINE_BACKGROUND_ACTIVITY_LABELS: Record<PipelineBackgroundSyncKind, string> = {
  character_dynamics: "角色成长中",
  state_snapshot: "状态同步中",
  payoff_ledger: "伏笔回填中",
};

function normalizePipelineBackgroundActivity(value: unknown): PipelineBackgroundSyncActivity | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const kind = raw.kind;
  const status = raw.status;
  if (
    (kind !== "character_dynamics" && kind !== "state_snapshot" && kind !== "payoff_ledger")
    || (status !== "running" && status !== "failed")
  ) {
    return null;
  }
  const updatedAt = typeof raw.updatedAt === "string" && raw.updatedAt.trim()
    ? raw.updatedAt.trim()
    : new Date(0).toISOString();
  return {
    kind,
    status,
    chapterId: typeof raw.chapterId === "string" ? raw.chapterId : "",
    chapterOrder: typeof raw.chapterOrder === "number" ? raw.chapterOrder : undefined,
    chapterTitle: typeof raw.chapterTitle === "string" && raw.chapterTitle.trim() ? raw.chapterTitle.trim() : undefined,
    updatedAt,
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
    labels.add(typeof activity.chapterOrder === "number" ? `${baseLabel}(第${activity.chapterOrder}章)` : baseLabel);
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
  return clampPipelineProgress((Math.max(0, input.completedCount) + stageFraction) / input.totalCount, input.stage)
    || Number(completedBase.toFixed(4));
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
      qualityAlertDetails: normalizeStringList(parsed.qualityAlertDetails ?? parsed.failedDetails),
      backgroundSync: normalizePipelineBackgroundSync(parsed.backgroundSync),
    };
  } catch {
    return {};
  }
}

export function stringifyPipelinePayload(input: PipelinePayload): string {
  const qualityAlertDetails = normalizeStringList(input.qualityAlertDetails) ?? [];
  const backgroundSync = normalizePipelineBackgroundSync(input.backgroundSync);
  return JSON.stringify({
    provider: input.provider ?? "deepseek",
    model: input.model ?? "",
    temperature: input.temperature ?? 0.8,
    ...(input.workflowTaskId?.trim() ? { workflowTaskId: input.workflowTaskId.trim() } : {}),
    ...(typeof input.maxRetries === "number" ? { maxRetries: input.maxRetries } : {}),
    runMode: input.runMode ?? "fast",
    autoReview: input.autoReview ?? true,
    autoRepair: input.autoRepair ?? true,
    skipCompleted: input.skipCompleted ?? true,
    qualityThreshold: input.qualityThreshold ?? null,
    repairMode: input.repairMode ?? "light_repair",
    ...(qualityAlertDetails.length > 0 ? { qualityAlertDetails } : {}),
    ...(backgroundSync?.activities?.length ? { backgroundSync } : {}),
  });
}

export function getPipelineQualityNotice(details: string[] | undefined): PipelineJobDecorations {
  const qualityAlertDetails = normalizeStringList(details) ?? [];
  if (qualityAlertDetails.length === 0) {
    return {
      displayStatus: null,
      noticeCode: null,
      noticeSummary: null,
      qualityAlertDetails: [],
      backgroundActivityLabels: [],
    };
  }
  return {
    displayStatus: "已完成，部分章节低于质量阈值",
    noticeCode: PIPELINE_QUALITY_NOTICE_CODE,
    noticeSummary: `以下章节未达到质量阈值，结果已保留，可继续复查或重跑：${qualityAlertDetails.join("；")}`,
    qualityAlertDetails,
    backgroundActivityLabels: [],
  };
}

export function decoratePipelineJob<T extends PipelineJobLike>(job: T): DecoratedPipelineJob<T> {
  const payload = parsePipelinePayload(job.payload);
  const notice = job.status === "succeeded"
    ? getPipelineQualityNotice(payload.qualityAlertDetails)
    : {
      displayStatus: null,
      noticeCode: null,
      noticeSummary: null,
      qualityAlertDetails: payload.qualityAlertDetails ?? [],
      backgroundActivityLabels: [],
    };
  const backgroundActivityLabels = buildPipelineBackgroundActivityLabels(payload.backgroundSync);
  return {
    ...job,
    displayStatus: notice.displayStatus,
    noticeCode: notice.noticeCode,
    noticeSummary: notice.noticeSummary,
    qualityAlertDetails: notice.qualityAlertDetails,
    backgroundActivityLabels,
  };
}
