import type { NovelControlPolicy } from "@ai-novel/shared/types/canonicalState";
import type { ArtifactSyncMode, PipelineJobStatus, VolumePlanDocument } from "@ai-novel/shared/types/novel";
import type {
  DirectorAutoExecutionState,
  DirectorConfirmRequest,
  DirectorQualityRepairRisk,
} from "@ai-novel/shared/types/novelDirector";
import type { NovelWorkflowCheckpoint } from "@ai-novel/shared/types/novelWorkflow";
import type { DirectorStateProposalResolutionRunResult } from "../runtime/DirectorStateProposalResolutionService";
import { directorAutomationLedgerEventService } from "../runtime/DirectorAutomationLedgerEventService";
import type { DirectorAutoExecutionChapterRef } from "./novelDirectorAutoExecution";

export type AutomationLedgerEventPort = Pick<
  typeof directorAutomationLedgerEventService,
  "recordEvent" | "recordRepairTicketCreated" | "recordCircuitBreakerOpened"
>;

export interface NovelDirectorAutoExecutionWorkflowPort {
  bootstrapTask(input: {
    workflowTaskId: string;
    novelId: string;
    lane: "auto_director";
    title: string;
    seedPayload?: Record<string, unknown>;
  }): Promise<unknown>;
  getTaskById(taskId: string): Promise<{ status: string } | null>;
  markTaskRunning(taskId: string, input: {
    stage: "chapter_execution" | "quality_repair";
    itemLabel: string;
    itemKey?: string | null;
    progress?: number;
    clearCheckpoint?: boolean;
  }): Promise<unknown>;
  recordCheckpoint(taskId: string, input: {
    stage: "quality_repair";
    checkpointType: "workflow_completed" | "chapter_batch_ready" | "replan_required";
    checkpointSummary: string;
    itemLabel: string;
    progress?: number;
    chapterId?: string | null;
    seedPayload?: Record<string, unknown>;
  }): Promise<unknown>;
  markTaskFailed(taskId: string, message: string, patch?: {
    stage?: "quality_repair";
    itemKey?: string | null;
    itemLabel?: string;
    checkpointType?: "chapter_batch_ready" | "replan_required";
    checkpointSummary?: string | null;
    chapterId?: string | null;
    progress?: number;
  }): Promise<unknown>;
}

export interface NovelDirectorAutoExecutionNovelPort {
  listChapters(novelId: string): Promise<DirectorAutoExecutionChapterRef[]>;
  startPipelineJob(novelId: string, options: {
    provider?: string;
    model?: string;
    temperature?: number;
    startOrder: number;
    endOrder: number;
    controlPolicy?: NovelControlPolicy;
    taskStyleProfileId?: string;
    maxRetries: number;
    runMode: "fast" | "polish";
    autoReview: boolean;
    autoRepair: boolean;
    artifactSyncMode?: ArtifactSyncMode;
    skipCompleted: boolean;
    qualityThreshold: number;
    repairMode: "light_repair" | "heavy_repair";
  }): Promise<{ id: string; status: PipelineJobStatus }>;
  findActivePipelineJobForRange(
    novelId: string,
    startOrder: number,
    endOrder: number,
    preferredJobId?: string | null,
  ): Promise<{ id: string; status: PipelineJobStatus } | null>;
  getPipelineJobById(jobId: string): Promise<{
    id: string;
    status: PipelineJobStatus;
    progress: number;
    startOrder?: number | null;
    endOrder?: number | null;
    pendingManualRecovery?: boolean | null;
    currentStage?: string | null;
    currentItemLabel?: string | null;
    noticeCode?: string | null;
    payload?: string | null;
    noticeSummary?: string | null;
    error?: string | null;
  } | null>;
  resumePipelineJob(jobId: string): Promise<unknown>;
  cancelPipelineJob(jobId: string): Promise<unknown>;
}

export type PipelineJobSnapshot = Awaited<ReturnType<NovelDirectorAutoExecutionNovelPort["getPipelineJobById"]>>;

export interface NovelDirectorAutoExecutionVolumeWorkspacePort {
  getVolumes(novelId: string): Promise<VolumePlanDocument>;
}

export interface NovelDirectorAutoExecutionRuntimeDeps {
  novelContextService: Pick<NovelDirectorAutoExecutionNovelPort, "listChapters">;
  novelService: Pick<
    NovelDirectorAutoExecutionNovelPort,
    "startPipelineJob" | "findActivePipelineJobForRange" | "getPipelineJobById" | "resumePipelineJob" | "cancelPipelineJob"
  >;
  volumeWorkspaceService?: Pick<NovelDirectorAutoExecutionVolumeWorkspacePort, "getVolumes">;
  workflowService: NovelDirectorAutoExecutionWorkflowPort;
  buildDirectorSeedPayload: (
    input: DirectorConfirmRequest,
    novelId: string,
    extra?: Record<string, unknown>,
  ) => Record<string, unknown>;
  shouldAutoContinueQualityRepair?: (input: {
    request: DirectorConfirmRequest;
    qualityRepairRisk: DirectorQualityRepairRisk;
    remainingChapterCount: number;
  }) => Promise<boolean> | boolean;
  recordAutoApproval?: (input: {
    taskId: string;
    checkpointType: NovelWorkflowCheckpoint;
    qualityRepairRisk: DirectorQualityRepairRisk;
    checkpointSummary?: string | null;
  }) => Promise<unknown>;
  replanNovel?: (novelId: string, input: {
    chapterId?: string;
    triggerType?: string;
    reason: string;
    sourceIssueIds?: string[];
    windowSize?: number;
    provider?: DirectorConfirmRequest["provider"];
    model?: string;
    temperature?: number;
  }) => Promise<unknown>;
  resolveStateProposals?: (input: {
    novelId: string;
    taskId: string;
    chapterId?: string | null;
    chapterOrder?: number | null;
    runMode: string;
    provider?: DirectorConfirmRequest["provider"];
    model?: string;
    temperature?: number;
  }) => Promise<DirectorStateProposalResolutionRunResult>;
  automationLedgerEventService?: AutomationLedgerEventPort;
}
