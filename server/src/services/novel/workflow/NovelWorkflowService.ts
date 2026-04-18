import type {
  NovelWorkflowCheckpoint,
  NovelWorkflowLane,
  NovelWorkflowResumeTarget,
  NovelWorkflowStage,
} from "@ai-novel/shared/types/novelWorkflow";
import { prisma } from "../../../db/prisma";
import type { TaskStatus } from "@ai-novel/shared/types/task";
import { AppError } from "../../../middleware/errorHandler";
import { getArchivedTaskIdSet, isTaskArchived } from "../../task/taskArchive";
import type { DirectorLLMOptions } from "@ai-novel/shared/types/novelDirector";
import {
  applyDirectorLlmOverride,
  normalizeDirectorRunMode,
  type DirectorWorkflowSeedPayload,
} from "../director/novelDirectorHelpers";
import {
  buildChapterDetailBundleLabel,
  buildChapterDetailBundleProgress,
  DIRECTOR_PROGRESS,
} from "../director/novelDirectorProgress";
import {
  buildDirectorAutoExecutionScopeLabel,
  normalizeDirectorAutoExecutionPlan,
  resolveDirectorAutoExecutionRangeFromState,
  resolveDirectorAutoExecutionWorkflowState,
} from "../director/novelDirectorAutoExecution";
import { NovelVolumeService } from "../volume/NovelVolumeService";
import { resolveStructuredOutlineRecoveryCursor } from "../director/novelDirectorStructuredOutlineRecovery";
import {
  appendMilestone,
  buildNovelCreateResumeTarget,
  buildNovelEditResumeTarget,
  defaultWorkflowTitle,
  mergeSeedPayload,
  NOVEL_WORKFLOW_STAGE_LABELS,
  NOVEL_WORKFLOW_STAGE_PROGRESS,
  parseSeedPayload,
  parseResumeTarget,
  stringifyResumeTarget,
} from "./novelWorkflow.shared";
import { isChapterTitleDiversityIssue } from "../volume/chapterTitleDiversity";
import {
  isHistoricalAutoDirectorFront10RecoveryUnsupportedFailure,
  isHistoricalAutoDirectorRecoveryNotNeededFailure,
} from "./novelWorkflowRecoveryHeuristics";
import { syncAutoDirectorChapterBatchCheckpoint } from "./novelWorkflowAutoDirectorReconciliation";
import { repairAutoDirectorCandidateSeedPayload } from "./novelWorkflowCandidateSeedRepair";

type WorkflowRow = Awaited<ReturnType<typeof prisma.novelWorkflowTask.findUnique>>;

interface AutoDirectorNovelCreationClaim {
  status: "claimed" | "attached" | "in_progress";
  task: WorkflowRow;
}

interface BootstrapWorkflowInput {
  workflowTaskId?: string | null;
  novelId?: string | null;
  lane: NovelWorkflowLane;
  title?: string | null;
  seedPayload?: Record<string, unknown>;
  forceNew?: boolean;
}

interface SyncWorkflowStageInput {
  stage: NovelWorkflowStage;
  itemLabel: string;
  itemKey?: string | null;
  checkpointType?: NovelWorkflowCheckpoint | null;
  checkpointSummary?: string | null;
  chapterId?: string | null;
  volumeId?: string | null;
  progress?: number;
  status?: TaskStatus;
}

const ACTIVE_STATUSES = ["queued", "running", "waiting_approval"] as const;
const CHECKPOINT_STAGE_MAP: Record<NovelWorkflowCheckpoint, NovelWorkflowStage> = {
  candidate_selection_required: "auto_director",
  book_contract_ready: "story_macro",
  character_setup_required: "character_setup",
  volume_strategy_ready: "volume_strategy",
  front10_ready: "chapter_execution",
  chapter_batch_ready: "quality_repair",
  replan_required: "quality_repair",
  workflow_completed: "quality_repair",
};

const CHECKPOINT_ITEM_LABELS: Record<NovelWorkflowCheckpoint, string> = {
  candidate_selection_required: "等待确认书级方向",
  book_contract_ready: "Book Contract 已就绪",
  character_setup_required: "等待审核角色准备",
  volume_strategy_ready: "卷战略已就绪",
  front10_ready: "已准备章节可进入执行",
  chapter_batch_ready: "自动执行已暂停",
  replan_required: "等待处理重规划建议",
  workflow_completed: "小说主流程已完成",
};

function buildChapterTitleDiversityTaskNotice(input: {
  issue: string;
  volumeId?: string | null;
}) {
  return {
    code: "CHAPTER_TITLE_DIVERSITY",
    summary: input.issue.trim(),
    action: {
      type: "open_structured_outline" as const,
      label: "快速修复章节标题",
      volumeId: input.volumeId?.trim() || null,
    },
  };
}

function parseSeedResumeTarget(seedPayloadJson: string | null | undefined) {
  const seedPayload = parseSeedPayload<{ resumeTarget?: unknown }>(seedPayloadJson);
  if (typeof seedPayload?.resumeTarget === "string") {
    return parseResumeTarget(seedPayload.resumeTarget);
  }
  if (seedPayload?.resumeTarget && typeof seedPayload.resumeTarget === "object") {
    return seedPayload.resumeTarget as NonNullable<ReturnType<typeof parseResumeTarget>>;
  }
  return null;
}

function mergeResumeTargets(
  primary: ReturnType<typeof parseResumeTarget>,
  fallback: ReturnType<typeof parseResumeTarget>,
) {
  if (!primary) {
    return fallback;
  }
  if (!fallback) {
    return primary;
  }
  return {
    ...fallback,
    ...primary,
    stage: primary.stage === "basic" && fallback.stage !== "basic"
      ? fallback.stage
      : primary.stage,
    chapterId: primary.chapterId ?? fallback.chapterId ?? null,
    volumeId: primary.volumeId ?? fallback.volumeId ?? null,
  };
}

interface ChapterBatchCheckpointRow {
  title: string;
  novelId: string | null;
  status: string;
  checkpointType: string | null;
  currentItemLabel: string | null;
  checkpointSummary: string | null;
  resumeTargetJson: string | null;
  seedPayloadJson: string | null;
  lastError: string | null;
  finishedAt: Date | null;
  milestonesJson: string | null;
}

function isQueuedWorkflowItemKey(itemKey: string | null | undefined): boolean {
  return itemKey === "project_setup" || itemKey === "auto_director" || !itemKey;
}

function isCandidateSelectionItemKey(itemKey: string | null | undefined): boolean {
  return itemKey === "auto_director" || itemKey?.startsWith("candidate_") === true;
}

function hasCandidateSelectionPhase(seedPayloadJson: string | null | undefined): boolean {
  const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(seedPayloadJson);
  if (!seedPayload) {
    return false;
  }
  if (seedPayload.candidateStage) {
    return true;
  }
  const phase = seedPayload.directorSession && typeof seedPayload.directorSession === "object"
    ? (seedPayload.directorSession as { phase?: unknown }).phase
    : null;
  return phase === "candidate_selection";
}

function isPreNovelAutoDirectorCandidateTask(row: {
  lane?: string | null;
  novelId?: string | null;
  checkpointType?: string | null;
  currentItemKey?: string | null;
  seedPayloadJson?: string | null;
} | null): boolean {
  return Boolean(
    row
    && row.lane === "auto_director"
    && !row.novelId
    && (
      row.checkpointType === "candidate_selection_required"
      || isCandidateSelectionItemKey(row.currentItemKey)
      || hasCandidateSelectionPhase(row.seedPayloadJson)
    ),
  );
}

function isChapterBatchCheckpointRow(
  row: ChapterBatchCheckpointRow | {
    title?: string | null;
    novelId?: string | null;
    status?: string | null;
    checkpointType?: string | null;
    currentItemLabel?: string | null;
    checkpointSummary?: string | null;
    resumeTargetJson?: string | null;
    seedPayloadJson?: string | null;
    lastError?: string | null;
    finishedAt?: Date | null;
    milestonesJson?: string | null;
  } | null,
): row is ChapterBatchCheckpointRow {
  return Boolean(
    row
    && typeof row.title === "string"
    && typeof row.status === "string"
    && Object.prototype.hasOwnProperty.call(row, "resumeTargetJson")
    && Object.prototype.hasOwnProperty.call(row, "seedPayloadJson")
    && Object.prototype.hasOwnProperty.call(row, "finishedAt")
    && Object.prototype.hasOwnProperty.call(row, "milestonesJson"),
  );
}

function mapStageToTab(stage: NovelWorkflowStage): NovelWorkflowResumeTarget["stage"] {
  if (stage === "story_macro") return "story_macro";
  if (stage === "character_setup") return "character";
  if (stage === "volume_strategy") return "outline";
  if (stage === "structured_outline") return "structured";
  if (stage === "chapter_execution") return "chapter";
  if (stage === "quality_repair") return "pipeline";
  return "basic";
}

function defaultProgressForStage(stage: NovelWorkflowStage): number {
  return NOVEL_WORKFLOW_STAGE_PROGRESS[stage] ?? 0.08;
}

function stageLabel(stage: NovelWorkflowStage): string {
  return NOVEL_WORKFLOW_STAGE_LABELS[stage] ?? stage;
}

function isTaskCancellationRequested(row: {
  status?: string | null;
  cancelRequestedAt?: Date | null;
} | null | undefined): boolean {
  return Boolean(row && (row.status === "cancelled" || row.cancelRequestedAt));
}

function isStructuredOutlineItemKey(itemKey: string | null | undefined): boolean {
  return itemKey === "beat_sheet"
    || itemKey === "chapter_list"
    || itemKey === "chapter_sync"
    || itemKey === "chapter_detail_bundle";
}

export class NovelWorkflowService {
  private readonly volumeService = new NovelVolumeService();

  private async getVisibleRowsByNovelIdRaw(novelId: string, lane?: NovelWorkflowLane) {
    const rows = await prisma.novelWorkflowTask.findMany({
      where: {
        novelId,
        ...(lane ? { lane } : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 10,
    });
    const archived = await getArchivedTaskIdSet("novel_workflow", rows.map((row) => row.id));
    return rows.filter((row) => !archived.has(row.id));
  }

  private async getVisibleRowsByNovelId(novelId: string, lane?: NovelWorkflowLane) {
    const rows = await this.getVisibleRowsByNovelIdRaw(novelId, lane);
    const healed = await Promise.all(
      rows.map((row) => this.healAutoDirectorTaskState(row.id, row)),
    );
    if (!healed.some(Boolean)) {
      return rows;
    }
    return this.getVisibleRowsByNovelIdRaw(novelId, lane);
  }

  private async getVisibleRowByIdRaw(taskId: string) {
    if (await isTaskArchived("novel_workflow", taskId)) {
      return null;
    }
    return prisma.novelWorkflowTask.findUnique({
      where: { id: taskId },
    });
  }

  private async getVisibleRowById(taskId: string) {
    const existing = await this.getVisibleRowByIdRaw(taskId);
    if (!existing) {
      return null;
    }
    const healed = await this.healAutoDirectorTaskState(taskId, existing);
    if (!healed) {
      return existing;
    }
    return this.getVisibleRowByIdRaw(taskId);
  }

  async findLatestVisibleTaskByNovelId(novelId: string, lane?: NovelWorkflowLane) {
    const rows = await this.getVisibleRowsByNovelId(novelId, lane);
    return rows[0] ?? null;
  }

  async findActiveTaskByNovelAndLane(novelId: string, lane: NovelWorkflowLane) {
    const rows = await this.getVisibleRowsByNovelId(novelId, lane);
    return rows.find((row) => ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number])) ?? null;
  }

  async listRecoverableAutoDirectorTasks() {
    const rows = await prisma.novelWorkflowTask.findMany({
      where: {
        lane: "auto_director",
        status: {
          in: ["queued", "running"],
        },
        pendingManualRecovery: false,
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        status: true,
      },
    });
    const archived = await getArchivedTaskIdSet("novel_workflow", rows.map((row) => row.id));
    return rows.filter((row) => !archived.has(row.id));
  }

  async getTaskById(taskId: string) {
    return this.getVisibleRowById(taskId);
  }

  async getTaskByIdWithoutHealing(taskId: string) {
    return this.getVisibleRowByIdRaw(taskId);
  }

  private async resolveStructuredOutlineTaskProgress(input: {
    novelId: string;
    seedPayloadJson?: string | null;
  }): Promise<{
    step: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync" | "completed";
    currentItemKey: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync";
    currentItemLabel: string;
    progress: number;
    scopeLabel: string;
    volumeId: string | null;
    chapterId: string | null;
  } | null> {
    const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(input.seedPayloadJson);
    const runMode = normalizeDirectorRunMode(
      seedPayload?.directorInput?.runMode
      ?? seedPayload?.runMode,
    );
    const plan = normalizeDirectorAutoExecutionPlan(
      runMode === "auto_to_execution"
        ? (seedPayload?.autoExecutionPlan ?? seedPayload?.directorInput?.autoExecutionPlan)
        : undefined,
    );

    const workspace = await this.volumeService.getVolumes(input.novelId).catch(() => null);
    if (!workspace) {
      return null;
    }
    const recoveryCursor = resolveStructuredOutlineRecoveryCursor({
      workspace,
      plan,
    });
    if (recoveryCursor.step === "completed") {
      return null;
    }

    if (recoveryCursor.step === "beat_sheet") {
      return {
        step: "beat_sheet",
        currentItemKey: "beat_sheet",
        currentItemLabel: `正在生成第 ${recoveryCursor.volumeOrder} 卷节奏板`,
        progress: DIRECTOR_PROGRESS.beatSheet,
        scopeLabel: recoveryCursor.scopeLabel,
        volumeId: recoveryCursor.volumeId,
        chapterId: null,
      };
    }

    if (recoveryCursor.step === "chapter_list") {
      const targetLabel = recoveryCursor.beatLabel?.trim()
        ? `正在生成第 ${recoveryCursor.volumeOrder} 卷节奏段：${recoveryCursor.beatLabel.trim()}`
        : `正在生成第 ${recoveryCursor.volumeOrder} 卷章节列表`;
      return {
        step: "chapter_list",
        currentItemKey: "chapter_list",
        currentItemLabel: targetLabel,
        progress: DIRECTOR_PROGRESS.chapterList,
        scopeLabel: recoveryCursor.scopeLabel,
        volumeId: recoveryCursor.volumeId,
        chapterId: null,
      };
    }

    if (recoveryCursor.step === "chapter_sync") {
      return {
        step: "chapter_sync",
        currentItemKey: "chapter_sync",
        currentItemLabel: `${recoveryCursor.scopeLabel}细化已完成，正在同步章节执行资源`,
        progress: DIRECTOR_PROGRESS.chapterDetailDone,
        scopeLabel: recoveryCursor.scopeLabel,
        volumeId: recoveryCursor.selectedChapters[0]?.volumeId ?? null,
        chapterId: recoveryCursor.selectedChapters[0]?.id ?? null,
      };
    }

    return {
      step: "chapter_detail_bundle",
      currentItemKey: "chapter_detail_bundle",
      currentItemLabel: buildChapterDetailBundleLabel(
        (recoveryCursor.nextChapterIndex ?? 0) + 1,
        recoveryCursor.totalChapterCount,
        recoveryCursor.detailMode ?? "purpose",
      ),
      progress: buildChapterDetailBundleProgress(
        recoveryCursor.completedDetailSteps,
        recoveryCursor.totalDetailSteps,
      ),
      scopeLabel: recoveryCursor.scopeLabel,
      volumeId: recoveryCursor.volumeId,
      chapterId: recoveryCursor.chapterId,
    };
  }

  async healBrokenAutoDirectorCandidateSeedPayload(
    taskId: string,
    row = null as {
      lane?: string | null;
      novelId?: string | null;
      status?: string | null;
      currentItemKey?: string | null;
      checkpointType?: string | null;
      checkpointSummary?: string | null;
      resumeTargetJson?: string | null;
      seedPayloadJson?: string | null;
    } | null,
  ): Promise<boolean> {
    const candidate = row ?? await this.getVisibleRowByIdRaw(taskId);
    if (!candidate || candidate.lane !== "auto_director") {
      return false;
    }

    const repaired = repairAutoDirectorCandidateSeedPayload(candidate.seedPayloadJson);
    if (!repaired) {
      return false;
    }

    const shouldRestoreCandidateSelection = repaired.staleTargetedCandidate
      && isPreNovelAutoDirectorCandidateTask(candidate);
    await prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        seedPayloadJson: repaired.seedPayloadJson,
        heartbeatAt: new Date(),
        status: shouldRestoreCandidateSelection ? "waiting_approval" : undefined,
        currentStage: shouldRestoreCandidateSelection ? stageLabel("auto_director") : undefined,
        currentItemKey: shouldRestoreCandidateSelection ? "auto_director" : undefined,
        currentItemLabel: shouldRestoreCandidateSelection
          ? CHECKPOINT_ITEM_LABELS.candidate_selection_required
          : undefined,
        checkpointType: shouldRestoreCandidateSelection ? "candidate_selection_required" : undefined,
        checkpointSummary: shouldRestoreCandidateSelection
          ? (candidate.checkpointSummary ?? "候选方案已恢复，请重新确认或继续微调。")
          : undefined,
        resumeTargetJson: shouldRestoreCandidateSelection
          ? stringifyResumeTarget(buildNovelCreateResumeTarget(taskId, "director"))
          : undefined,
        lastError: shouldRestoreCandidateSelection ? null : undefined,
        finishedAt: shouldRestoreCandidateSelection ? null : undefined,
        cancelRequestedAt: shouldRestoreCandidateSelection ? null : undefined,
      },
    });
    return true;
  }

  async healAutoDirectorTaskState(
    taskId: string,
    row = null as {
      title?: string | null;
      novelId?: string | null;
      lane?: string | null;
      status?: string | null;
      progress?: number | null;
      currentStage?: string | null;
      currentItemKey?: string | null;
      currentItemLabel?: string | null;
      checkpointType?: string | null;
      checkpointSummary?: string | null;
      resumeTargetJson?: string | null;
        seedPayloadJson?: string | null;
        heartbeatAt?: Date | null;
        finishedAt?: Date | null;
        milestonesJson?: string | null;
        lastError?: string | null;
        cancelRequestedAt?: Date | null;
      } | null,
    ): Promise<boolean> {
      if (isTaskCancellationRequested(row)) {
        return false;
      }
      const brokenSeedHealed = await this.healBrokenAutoDirectorCandidateSeedPayload(taskId, row);
      const normalizedRow = brokenSeedHealed ? await this.getVisibleRowByIdRaw(taskId) : row;
      if (isTaskCancellationRequested(normalizedRow)) {
        return false;
      }
      const queuedHealed = await this.healStaleAutoDirectorQueuedProgress(taskId, normalizedRow);
      const historicalHealed = await this.healHistoricalAutoDirectorRecoveryFailure(taskId, normalizedRow);
      const front10Healed = await this.healHistoricalAutoDirectorFront10RecoveryFailure(taskId, normalizedRow);
      const titleDiversityHealed = await this.healChapterTitleDiversitySoftFailure(taskId, normalizedRow);
      const structuredOutlineHealed = await this.healStaleAutoDirectorStructuredOutlineProgress(taskId, normalizedRow);
      const checkpointRow = (brokenSeedHealed || queuedHealed || historicalHealed || front10Healed || titleDiversityHealed || structuredOutlineHealed)
        ? await this.getVisibleRowByIdRaw(taskId)
        : (normalizedRow ?? await this.getVisibleRowByIdRaw(taskId));
    const checkpointHealed = isChapterBatchCheckpointRow(checkpointRow)
      ? await syncAutoDirectorChapterBatchCheckpoint({
        taskId,
        row: checkpointRow,
      })
      : false;
    return brokenSeedHealed || queuedHealed || historicalHealed || front10Healed || titleDiversityHealed || structuredOutlineHealed || checkpointHealed;
  }

  async healStaleAutoDirectorQueuedProgress(
    taskId: string,
    row = null as {
      lane?: string | null;
      status?: string | null;
      currentItemKey?: string | null;
      checkpointType?: string | null;
      checkpointSummary?: string | null;
      heartbeatAt?: Date | null;
      lastError?: string | null;
      cancelRequestedAt?: Date | null;
    } | null,
  ): Promise<boolean> {
    const candidate = row ?? await this.getVisibleRowByIdRaw(taskId);
    if (!candidate || candidate.lane !== "auto_director" || isTaskCancellationRequested(candidate)) {
      return false;
    }

    const shouldPromoteToRunning = candidate.status === "queued"
      && !isQueuedWorkflowItemKey(candidate.currentItemKey);
    const hasStaleCandidateCheckpoint = candidate.checkpointType === "candidate_selection_required"
      && !isCandidateSelectionItemKey(candidate.currentItemKey);

    if (!shouldPromoteToRunning && !hasStaleCandidateCheckpoint) {
      return false;
    }

    await prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        status: shouldPromoteToRunning ? "running" : undefined,
        checkpointType: hasStaleCandidateCheckpoint ? null : undefined,
        checkpointSummary: hasStaleCandidateCheckpoint ? null : undefined,
        heartbeatAt: candidate.heartbeatAt ?? new Date(),
        finishedAt: shouldPromoteToRunning ? null : undefined,
        cancelRequestedAt: shouldPromoteToRunning ? null : undefined,
        lastError: shouldPromoteToRunning && candidate.lastError?.includes("恢复失败")
          ? null
          : undefined,
      },
    });
    return true;
  }

  async healHistoricalAutoDirectorRecoveryFailure(
    taskId: string,
    row = null as {
      lane?: string | null;
      status?: string | null;
      checkpointType?: string | null;
      lastError?: string | null;
    } | null,
  ): Promise<boolean> {
    const candidate = row ?? await this.getVisibleRowByIdRaw(taskId);
    if (!candidate || !isHistoricalAutoDirectorRecoveryNotNeededFailure(candidate)) {
      return false;
    }
    const existing = await this.getVisibleRowByIdRaw(taskId);
    if (!existing) {
      return false;
    }
    await this.restoreTaskToCheckpoint(taskId, existing);
    return true;
  }

  async healHistoricalAutoDirectorFront10RecoveryFailure(
    taskId: string,
    row = null as {
      lane?: string | null;
      status?: string | null;
      novelId?: string | null;
      seedPayloadJson?: string | null;
      checkpointType?: string | null;
      progress?: number | null;
      lastError?: string | null;
    } | null,
  ): Promise<boolean> {
    const candidate = row ?? await this.getVisibleRowByIdRaw(taskId);
    if (!candidate || !isHistoricalAutoDirectorFront10RecoveryUnsupportedFailure(candidate)) {
      return false;
    }

    const existing = await this.getVisibleRowByIdRaw(taskId);
    if (!existing) {
      return false;
    }

    const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(existing.seedPayloadJson);
    const directorSession = seedPayload?.directorSession;
    const autoExecution = seedPayload?.autoExecution;
    const pipelineJobId = autoExecution?.pipelineJobId?.trim();
    if (
      !existing.novelId
      || !pipelineJobId
      || directorSession?.phase !== "front10_ready"
    ) {
      return false;
    }

    const job = await prisma.generationJob.findUnique({
      where: { id: pipelineJobId },
      select: {
        id: true,
        status: true,
        progress: true,
        currentStage: true,
        currentItemLabel: true,
        payload: true,
      },
    });
    if (!job || (job.status !== "queued" && job.status !== "running")) {
      return false;
    }

    const range = resolveDirectorAutoExecutionRangeFromState(autoExecution);
    if (!range) {
      return false;
    }

    const runningState = resolveDirectorAutoExecutionWorkflowState({
      progress: job.progress,
      currentStage: job.currentStage,
      currentItemLabel: job.currentItemLabel,
      payload: job.payload,
    }, range, autoExecution);
    const nextResumeTarget = buildNovelEditResumeTarget({
      novelId: existing.novelId,
      taskId,
      stage: runningState.stage === "quality_repair" ? "pipeline" : "chapter",
      chapterId: autoExecution?.nextChapterId ?? autoExecution?.firstChapterId ?? null,
    });

    await prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        status: job.status === "queued" ? "queued" : "running",
        progress: Math.max(existing.progress ?? 0, runningState.progress ?? defaultProgressForStage(runningState.stage)),
        currentStage: stageLabel(runningState.stage),
        currentItemKey: runningState.itemKey,
        currentItemLabel: runningState.itemLabel,
        checkpointType: null,
        checkpointSummary: null,
        resumeTargetJson: stringifyResumeTarget(nextResumeTarget),
        heartbeatAt: new Date(),
        finishedAt: null,
        cancelRequestedAt: null,
        lastError: null,
      },
    });
    return true;
  }

  async healChapterTitleDiversitySoftFailure(
    taskId: string,
    row = null as {
      lane?: string | null;
      novelId?: string | null;
      status?: string | null;
      currentItemKey?: string | null;
      currentItemLabel?: string | null;
      resumeTargetJson?: string | null;
      seedPayloadJson?: string | null;
      lastError?: string | null;
    } | null,
  ): Promise<boolean> {
    const candidate = row ?? await this.getVisibleRowByIdRaw(taskId);
    const issue = candidate?.lastError?.trim() || "";
    if (
      !candidate
      || candidate.lane !== "auto_director"
      || candidate.status !== "failed"
      || !isChapterTitleDiversityIssue(issue)
    ) {
      return false;
    }

    const existing = await this.getVisibleRowByIdRaw(taskId);
    if (!existing) {
      return false;
    }

    const resumeTarget = mergeResumeTargets(
      parseResumeTarget(existing.resumeTargetJson),
      parseSeedResumeTarget(existing.seedPayloadJson),
    );
    const notice = buildChapterTitleDiversityTaskNotice({
      issue,
      volumeId: resumeTarget?.volumeId ?? null,
    });
    const nextResumeTarget = (resumeTarget && resumeTarget.stage !== "basic")
      ? {
        ...resumeTarget,
        volumeId: resumeTarget.volumeId ?? notice.action.volumeId ?? null,
      }
      : buildNovelEditResumeTarget({
        novelId: existing.novelId ?? resumeTarget?.novelId ?? "",
        taskId,
        stage: "structured",
        volumeId: resumeTarget?.volumeId ?? notice.action.volumeId ?? null,
      });

    await prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        status: "waiting_approval",
        currentStage: stageLabel("structured_outline"),
        currentItemKey: existing.currentItemKey ?? "chapter_list",
        currentItemLabel: "章节列表已生成，但标题结构仍需分散",
        checkpointType: null,
        checkpointSummary: null,
        resumeTargetJson: stringifyResumeTarget(nextResumeTarget),
        seedPayloadJson: mergeSeedPayload(existing.seedPayloadJson, {
          taskNotice: notice,
        }),
        heartbeatAt: new Date(),
        finishedAt: null,
        cancelRequestedAt: null,
        lastError: null,
      },
    });
    return true;
  }

  async healStaleAutoDirectorStructuredOutlineProgress(
    taskId: string,
    row = null as {
      novelId?: string | null;
      lane?: string | null;
      status?: string | null;
      currentStage?: string | null;
      currentItemKey?: string | null;
      currentItemLabel?: string | null;
      checkpointType?: string | null;
      progress?: number | null;
      seedPayloadJson?: string | null;
      cancelRequestedAt?: Date | null;
    } | null,
  ): Promise<boolean> {
    const candidate = row ?? await this.getVisibleRowByIdRaw(taskId);
    if (
      !candidate
      || candidate.lane !== "auto_director"
      || !candidate.novelId
      || candidate.status !== "running"
      || candidate.checkpointType
      || isTaskCancellationRequested(candidate)
      || (!isStructuredOutlineItemKey(candidate.currentItemKey) && candidate.currentStage !== stageLabel("structured_outline"))
    ) {
      return false;
    }

    const progressState = await this.resolveStructuredOutlineTaskProgress({
      novelId: candidate.novelId,
      seedPayloadJson: candidate.seedPayloadJson,
    });
    if (!progressState) {
      return false;
    }

    if (
      candidate.currentItemKey === progressState.currentItemKey
      && candidate.currentItemLabel === progressState.currentItemLabel
      && typeof candidate.progress === "number"
      && Math.abs(candidate.progress - progressState.progress) < 0.0001
    ) {
      return false;
    }

    await prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        currentStage: stageLabel("structured_outline"),
        currentItemKey: progressState.currentItemKey,
        currentItemLabel: progressState.currentItemLabel,
        progress: Math.max(candidate.progress ?? 0, progressState.progress),
        resumeTargetJson: stringifyResumeTarget(this.buildResumeTarget({
          taskId,
          novelId: candidate.novelId,
          lane: "auto_director",
          stage: "structured_outline",
          chapterId: progressState.chapterId,
          volumeId: progressState.volumeId,
        })),
        heartbeatAt: new Date(),
      },
    });
    return true;
  }

  async applyAutoDirectorLlmOverride(
    taskId: string,
    llmOverride: Pick<DirectorLLMOptions, "provider" | "model" | "temperature">,
  ) {
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    if (existing.lane !== "auto_director") {
      return existing;
    }
    const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(existing.seedPayloadJson);
    const nextSeedPayload = applyDirectorLlmOverride(seedPayload, llmOverride);
    if (!nextSeedPayload) {
      throw new AppError("当前自动导演任务缺少可覆盖的模型上下文。", 400);
    }
    return prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        seedPayloadJson: JSON.stringify(nextSeedPayload),
        heartbeatAt: new Date(),
      },
    });
  }

  private async getNovelTitle(novelId: string): Promise<string | null> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { title: true },
    });
    return novel?.title ?? null;
  }

  private buildResumeTarget(input: {
    taskId: string;
    novelId?: string | null;
    lane: NovelWorkflowLane;
    stage: NovelWorkflowStage;
    chapterId?: string | null;
    volumeId?: string | null;
  }): NovelWorkflowResumeTarget {
    if (!input.novelId) {
      return buildNovelCreateResumeTarget(input.taskId, input.lane === "auto_director" ? "director" : null);
    }
    return buildNovelEditResumeTarget({
      novelId: input.novelId,
      taskId: input.taskId,
      stage: mapStageToTab(input.stage),
      chapterId: input.chapterId,
      volumeId: input.volumeId,
    });
  }

  private async createWorkflow(input: BootstrapWorkflowInput) {
    const novelTitle = input.novelId ? await this.getNovelTitle(input.novelId) : null;
    const created = await prisma.novelWorkflowTask.create({
      data: {
        novelId: input.novelId ?? null,
        lane: input.lane,
        title: defaultWorkflowTitle({
          lane: input.lane,
          title: input.title,
          novelTitle,
        }),
        status: "queued",
        progress: input.novelId ? defaultProgressForStage("project_setup") : 0,
        currentStage: input.lane === "auto_director" ? "AI 自动导演" : "项目设定",
        currentItemKey: input.lane === "auto_director" ? "auto_director" : "project_setup",
        currentItemLabel: input.lane === "auto_director" ? "等待生成候选方向" : "等待创建项目",
        resumeTargetJson: stringifyResumeTarget(
          this.buildResumeTarget({
            taskId: "",
            novelId: input.novelId ?? null,
            lane: input.lane,
            stage: input.lane === "auto_director" ? "auto_director" : "project_setup",
          }),
        ),
        seedPayloadJson: input.seedPayload ? JSON.stringify(input.seedPayload) : null,
      },
    });
    const resumeTarget = this.buildResumeTarget({
      taskId: created.id,
      novelId: created.novelId,
      lane: created.lane,
      stage: created.lane === "auto_director" ? "auto_director" : "project_setup",
    });
    return prisma.novelWorkflowTask.update({
      where: { id: created.id },
      data: {
        resumeTargetJson: stringifyResumeTarget(resumeTarget),
      },
    });
  }

  async bootstrapTask(input: BootstrapWorkflowInput) {
    if (input.workflowTaskId?.trim()) {
      const existing = await this.getVisibleRowById(input.workflowTaskId.trim());
      if (existing) {
        if (input.novelId?.trim() && existing.novelId !== input.novelId.trim()) {
          if (isPreNovelAutoDirectorCandidateTask(existing)) {
            return existing;
          }
          const attached = await this.attachNovelToTask(existing.id, input.novelId.trim());
          if (input.seedPayload) {
            return prisma.novelWorkflowTask.update({
              where: { id: attached.id },
              data: {
                seedPayloadJson: mergeSeedPayload(attached.seedPayloadJson, input.seedPayload),
                heartbeatAt: new Date(),
              },
            });
          }
          return attached;
        }
        if (input.seedPayload) {
          return prisma.novelWorkflowTask.update({
            where: { id: existing.id },
            data: {
              seedPayloadJson: mergeSeedPayload(existing.seedPayloadJson, input.seedPayload),
              heartbeatAt: new Date(),
            },
          });
        }
        return existing;
      }
    }

    if (input.novelId?.trim() && input.forceNew !== true) {
      const visibleRows = await this.getVisibleRowsByNovelId(input.novelId.trim(), input.lane);
      const active = visibleRows.find((row) => ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number]));
      if (active) {
        return active;
      }
      const latest = visibleRows[0];
      if (latest) {
        return latest;
      }
    }

    return this.createWorkflow({
      ...input,
      novelId: input.novelId?.trim() || null,
    });
  }

  async attachNovelToTask(taskId: string, novelId: string, stage: NovelWorkflowStage = "project_setup") {
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    const novelTitle = await this.getNovelTitle(novelId);
    return prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        novelId,
        title: novelTitle ?? existing.title,
        progress: Math.max(existing.progress, defaultProgressForStage(stage)),
        currentStage: stageLabel(stage),
        currentItemKey: existing.lane === "auto_director"
          ? (existing.currentItemKey ?? "novel_create")
          : stage,
        currentItemLabel: existing.lane === "auto_director"
          ? (existing.currentItemLabel ?? "正在创建小说项目")
          : (stage === "project_setup" ? "小说项目已创建" : (existing.currentItemLabel ?? "已恢复小说主任务")),
        resumeTargetJson: stringifyResumeTarget(this.buildResumeTarget({
          taskId,
          novelId,
          lane: existing.lane,
          stage,
        })),
        heartbeatAt: new Date(),
      },
    });
  }

  async claimAutoDirectorNovelCreation(taskId: string, input: {
    itemLabel: string;
    progress: number;
  }): Promise<AutoDirectorNovelCreationClaim> {
    const existing = await this.getVisibleRowByIdRaw(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    if (existing.lane !== "auto_director") {
      throw new AppError("Only auto director workflow tasks can claim novel creation.", 400);
    }
    if (existing.novelId) {
      return {
        status: "attached",
        task: existing,
      };
    }

    const now = new Date();
    const claimed = await prisma.novelWorkflowTask.updateMany({
      where: {
        id: taskId,
        lane: "auto_director",
        novelId: null,
        OR: [
          { currentItemKey: null },
          { currentItemKey: "auto_director" },
          { currentItemKey: { startsWith: "candidate_" } },
          {
            status: {
              in: ["failed", "cancelled"],
            },
          },
        ],
      },
      data: {
        status: "running",
        startedAt: existing.startedAt ?? now,
        finishedAt: null,
        heartbeatAt: now,
        progress: Math.max(existing.progress ?? 0, input.progress),
        currentStage: stageLabel("auto_director"),
        currentItemKey: "novel_create",
        currentItemLabel: input.itemLabel,
        checkpointType: null,
        checkpointSummary: null,
        lastError: null,
        cancelRequestedAt: null,
      },
    });

    const latest = await this.getVisibleRowByIdRaw(taskId);
    if (!latest) {
      throw new AppError("Workflow task not found.", 404);
    }
    if (latest.novelId) {
      return {
        status: "attached",
        task: latest,
      };
    }
    return {
      status: claimed.count > 0 ? "claimed" : "in_progress",
      task: latest,
    };
  }

  async markTaskRunning(taskId: string, input: {
    stage: NovelWorkflowStage;
    itemLabel: string;
    itemKey?: string | null;
    progress?: number;
    clearCheckpoint?: boolean;
    chapterId?: string | null;
    volumeId?: string | null;
    seedPayload?: Record<string, unknown>;
  }) {
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    if (isTaskCancellationRequested(existing)) {
      throw new AppError("WORKFLOW_TASK_CANCELLED", 409);
    }
    const resumeTarget = this.buildResumeTarget({
      taskId,
      novelId: existing.novelId,
      lane: existing.lane,
      stage: input.stage,
      chapterId: input.chapterId,
      volumeId: input.volumeId,
    });
    return prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        status: "running",
        startedAt: existing.startedAt ?? new Date(),
        finishedAt: null,
        heartbeatAt: new Date(),
        pendingManualRecovery: false,
        currentStage: stageLabel(input.stage),
        currentItemKey: input.itemKey ?? input.stage,
        currentItemLabel: input.itemLabel,
        progress: Math.max(existing.progress, input.progress ?? defaultProgressForStage(input.stage)),
        checkpointType: input.clearCheckpoint ? null : existing.checkpointType,
        checkpointSummary: input.clearCheckpoint ? null : existing.checkpointSummary,
        resumeTargetJson: stringifyResumeTarget(resumeTarget),
        seedPayloadJson: input.seedPayload
          ? mergeSeedPayload(existing.seedPayloadJson, input.seedPayload)
          : existing.seedPayloadJson,
        lastError: null,
        cancelRequestedAt: null,
      },
    });
  }

  async markTaskWaitingApproval(taskId: string, input: {
    stage: NovelWorkflowStage;
    itemLabel: string;
    itemKey?: string | null;
    progress?: number;
    clearCheckpoint?: boolean;
    checkpointType?: NovelWorkflowCheckpoint | null;
    checkpointSummary?: string | null;
    chapterId?: string | null;
    volumeId?: string | null;
    seedPayload?: Record<string, unknown>;
  }) {
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    if (isTaskCancellationRequested(existing)) {
      throw new AppError("WORKFLOW_TASK_CANCELLED", 409);
    }
    const resumeTarget = this.buildResumeTarget({
      taskId,
      novelId: existing.novelId,
      lane: existing.lane,
      stage: input.stage,
      chapterId: input.chapterId,
      volumeId: input.volumeId,
    });
    return prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        status: "waiting_approval",
        finishedAt: null,
        heartbeatAt: new Date(),
        currentStage: stageLabel(input.stage),
        currentItemKey: input.itemKey ?? input.stage,
        currentItemLabel: input.itemLabel,
        progress: Math.max(existing.progress, input.progress ?? defaultProgressForStage(input.stage)),
        checkpointType: input.clearCheckpoint
          ? null
          : (input.checkpointType ?? existing.checkpointType),
        checkpointSummary: input.clearCheckpoint
          ? null
          : (input.checkpointSummary ?? existing.checkpointSummary),
        resumeTargetJson: stringifyResumeTarget(resumeTarget),
        seedPayloadJson: input.seedPayload
          ? mergeSeedPayload(existing.seedPayloadJson, input.seedPayload)
          : existing.seedPayloadJson,
        lastError: null,
        cancelRequestedAt: null,
      },
    });
  }

  async markTaskFailed(taskId: string, message: string, patch?: Partial<SyncWorkflowStageInput>) {
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      return null;
    }
    const stage = patch?.stage ?? "auto_director";
    const resumeTarget = parseResumeTarget(existing.resumeTargetJson) ?? this.buildResumeTarget({
      taskId,
      novelId: existing.novelId,
      lane: existing.lane,
      stage,
      chapterId: patch?.chapterId,
      volumeId: patch?.volumeId,
    });
    return prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        status: "failed",
        finishedAt: new Date(),
        heartbeatAt: new Date(),
        currentStage: patch?.stage ? stageLabel(patch.stage) : existing.currentStage,
        currentItemKey: patch?.itemKey ?? existing.currentItemKey,
        currentItemLabel: patch?.itemLabel ?? existing.currentItemLabel,
        checkpointType: patch?.checkpointType ?? existing.checkpointType,
        checkpointSummary: patch?.checkpointSummary ?? existing.checkpointSummary,
        resumeTargetJson: stringifyResumeTarget(resumeTarget),
        lastError: message.trim(),
      },
    });
  }

  async cancelTask(taskId: string) {
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      throw new AppError("Task not found.", 404);
    }
    return prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        status: "cancelled",
        cancelRequestedAt: new Date(),
        finishedAt: new Date(),
        heartbeatAt: new Date(),
      },
    });
  }

  async retryTask(taskId: string) {
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      throw new AppError("Task not found.", 404);
    }
      return prisma.novelWorkflowTask.update({
        where: { id: taskId },
        data: {
          status: existing.checkpointType ? "waiting_approval" : "queued",
          pendingManualRecovery: false,
          attemptCount: existing.attemptCount + 1,
          lastError: null,
        finishedAt: null,
        cancelRequestedAt: null,
        heartbeatAt: new Date(),
      },
    });
  }

  async restoreTaskToCheckpoint(
    taskId: string,
    row = null as Awaited<ReturnType<typeof prisma.novelWorkflowTask.findUnique>> | null,
  ) {
    const existing = row ?? await this.getVisibleRowByIdRaw(taskId);
    if (!existing || !existing.checkpointType) {
      return existing;
    }
    const checkpointType = existing.checkpointType as NovelWorkflowCheckpoint;
    const checkpointStage = CHECKPOINT_STAGE_MAP[checkpointType];
    const resumeTarget = checkpointType === "candidate_selection_required"
      ? buildNovelCreateResumeTarget(taskId, "director")
      : (
        parseResumeTarget(existing.resumeTargetJson) ?? this.buildResumeTarget({
          taskId,
          novelId: existing.novelId,
          lane: existing.lane,
          stage: checkpointStage,
        })
      );
    return prisma.novelWorkflowTask.update({
      where: { id: taskId },
        data: {
          status: checkpointType === "workflow_completed" ? "succeeded" : "waiting_approval",
          pendingManualRecovery: false,
          finishedAt: checkpointType === "workflow_completed" ? (existing.finishedAt ?? new Date()) : null,
        cancelRequestedAt: null,
        heartbeatAt: new Date(),
        currentStage: stageLabel(checkpointStage),
        currentItemKey: checkpointStage,
        currentItemLabel: CHECKPOINT_ITEM_LABELS[checkpointType] ?? existing.currentItemLabel,
        progress: Math.max(existing.progress, defaultProgressForStage(checkpointStage)),
        resumeTargetJson: stringifyResumeTarget(resumeTarget),
        lastError: null,
      },
    });
  }

  async continueTask(taskId: string) {
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      throw new AppError("Task not found.", 404);
    }
    if (isTaskCancellationRequested(existing)) {
      throw new AppError("WORKFLOW_TASK_CANCELLED", 409);
    }
      return prisma.novelWorkflowTask.update({
        where: { id: taskId },
        data: {
          heartbeatAt: new Date(),
          pendingManualRecovery: false,
          status: existing.status === "queued" ? "running" : existing.status,
        },
      });
  }

  async requeueTaskForRecovery(taskId: string, message: string) {
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      throw new AppError("Task not found.", 404);
    }
      return prisma.novelWorkflowTask.update({
        where: { id: taskId },
        data: {
          status: "queued",
          pendingManualRecovery: true,
          finishedAt: null,
          cancelRequestedAt: null,
          heartbeatAt: null,
        lastError: message.trim(),
      },
    });
  }

  async recordCandidateSelectionRequired(taskId: string, input: {
    seedPayload?: Record<string, unknown>;
    summary: string;
  }) {
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    if (isTaskCancellationRequested(existing)) {
      throw new AppError("WORKFLOW_TASK_CANCELLED", 409);
    }
    return prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        status: "waiting_approval",
        currentStage: stageLabel("auto_director"),
        currentItemKey: "auto_director",
        currentItemLabel: "等待确认书级方向",
        checkpointType: "candidate_selection_required",
        checkpointSummary: input.summary,
        resumeTargetJson: stringifyResumeTarget(buildNovelCreateResumeTarget(taskId, "director")),
        progress: Math.max(existing.progress, defaultProgressForStage("auto_director")),
        heartbeatAt: new Date(),
        seedPayloadJson: input.seedPayload
          ? mergeSeedPayload(existing.seedPayloadJson, input.seedPayload)
          : existing.seedPayloadJson,
        milestonesJson: appendMilestone(existing.milestonesJson, "candidate_selection_required", input.summary),
      },
    });
  }

  async recordCheckpoint(taskId: string, input: {
    stage: NovelWorkflowStage;
    checkpointType: NovelWorkflowCheckpoint;
    checkpointSummary: string;
    itemLabel: string;
    chapterId?: string | null;
    volumeId?: string | null;
    progress?: number;
    seedPayload?: Record<string, unknown>;
  }) {
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    if (isTaskCancellationRequested(existing)) {
      throw new AppError("WORKFLOW_TASK_CANCELLED", 409);
    }
    const resumeTarget = this.buildResumeTarget({
      taskId,
      novelId: existing.novelId,
      lane: existing.lane,
      stage: input.stage,
      chapterId: input.chapterId,
      volumeId: input.volumeId,
    });
    return prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        status: input.checkpointType === "workflow_completed" ? "succeeded" : "waiting_approval",
        progress: input.progress ?? defaultProgressForStage(input.stage),
        currentStage: stageLabel(input.stage),
        currentItemKey: input.stage,
        currentItemLabel: input.itemLabel,
        checkpointType: input.checkpointType,
        checkpointSummary: input.checkpointSummary,
        resumeTargetJson: stringifyResumeTarget(resumeTarget),
        heartbeatAt: new Date(),
        finishedAt: input.checkpointType === "workflow_completed" ? new Date() : null,
        seedPayloadJson: input.seedPayload
          ? mergeSeedPayload(existing.seedPayloadJson, input.seedPayload)
          : existing.seedPayloadJson,
        milestonesJson: appendMilestone(existing.milestonesJson, input.checkpointType, input.checkpointSummary),
        lastError: null,
      },
    });
  }

  async syncStageByNovelId(novelId: string, input: SyncWorkflowStageInput) {
    const task = await this.bootstrapTask({
      novelId,
      lane: "manual_create",
    });
    const resumeTarget = this.buildResumeTarget({
      taskId: task.id,
      novelId,
      lane: task.lane,
      stage: input.stage,
      chapterId: input.chapterId,
      volumeId: input.volumeId,
    });
    return prisma.novelWorkflowTask.update({
      where: { id: task.id },
      data: {
        status: input.status ?? "waiting_approval",
        progress: input.progress ?? Math.max(task.progress, defaultProgressForStage(input.stage)),
        currentStage: stageLabel(input.stage),
        currentItemKey: input.itemKey ?? input.stage,
        currentItemLabel: input.itemLabel,
        checkpointType: input.checkpointType ?? task.checkpointType,
        checkpointSummary: input.checkpointSummary ?? task.checkpointSummary,
        resumeTargetJson: stringifyResumeTarget(resumeTarget),
        heartbeatAt: new Date(),
        milestonesJson: input.checkpointType && input.checkpointSummary
          ? appendMilestone(task.milestonesJson, input.checkpointType, input.checkpointSummary)
          : task.milestonesJson,
      },
    });
  }
}
