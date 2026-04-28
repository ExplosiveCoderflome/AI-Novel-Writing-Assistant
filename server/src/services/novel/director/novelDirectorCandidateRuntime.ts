import {
  DIRECTOR_RUN_MODES,
  type DirectorCandidateBatch,
  type DirectorCandidatesRequest,
} from "@ai-novel/shared/types/novelDirector";
import type { NovelWorkflowService } from "../workflow/NovelWorkflowService";
import {
  getDirectorLlmOptionsFromSeedPayload,
  type DirectorWorkflowSeedPayload,
} from "./novelDirectorHelpers";
import type { NovelDirectorCandidateStageService } from "./novelDirectorCandidateStage";
import type { DirectorRuntimeService } from "./runtime/DirectorRuntimeService";
import {
  getDirectorCandidateNodeAdapter,
  type DirectorCandidateStageNode,
} from "./novelDirectorCandidateNodeAdapters";
import {
  isDirectorRuntimeGateError,
  type NovelDirectorRuntimeOrchestrator,
} from "./novelDirectorRuntimeOrchestrator";

type WorkflowTaskFailurePort = Pick<NovelWorkflowService, "markTaskFailed">;

function readText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export class NovelDirectorCandidateRuntime {
  constructor(private readonly deps: {
    workflowService: WorkflowTaskFailurePort;
    candidateStageService: NovelDirectorCandidateStageService;
    directorRuntime: DirectorRuntimeService;
    runtimeOrchestrator: NovelDirectorRuntimeOrchestrator;
    scheduleBackgroundRun: (taskId: string, runner: () => Promise<void>) => void;
    withWorkflowTaskUsage: <T>(workflowTaskId: string | null | undefined, runner: () => Promise<T>) => Promise<T>;
  }) {}

  async continueTask(
    taskId: string,
    input: {
      novelId?: string | null;
      status: string;
      checkpointType: string | null;
      currentItemKey?: string | null;
      seedPayload: DirectorWorkflowSeedPayload;
    },
  ): Promise<boolean> {
    if (!this.isCandidateSelectionTask({
      novelId: input.novelId,
      checkpointType: input.checkpointType,
      currentItemKey: input.currentItemKey,
      seedPayload: input.seedPayload,
    })) {
      return false;
    }
    if (input.checkpointType === "candidate_selection_required" || input.status === "waiting_approval") {
      return true;
    }
    const baseRequest = this.buildCandidateStageBaseRequest(taskId, input.seedPayload);
    if (!baseRequest) {
      throw new Error("自动导演候选阶段任务缺少恢复所需上下文。");
    }
    const candidateStage = input.seedPayload.candidateStage;
    const previousBatches = Array.isArray(input.seedPayload.batches)
      ? input.seedPayload.batches as DirectorCandidateBatch[]
      : [];
    const feedback = candidateStage?.feedback?.trim();
    const mode = candidateStage?.mode ?? (previousBatches.length === 0 ? "generate" : "refine");
    if (!mode) {
      throw new Error("自动导演候选阶段任务缺少恢复模式。");
    }

    this.deps.scheduleBackgroundRun(taskId, async () => {
      if (mode === "generate") {
        await this.deps.candidateStageService.generateCandidates(baseRequest);
        return;
      }
      if (previousBatches.length === 0) {
        throw new Error("自动导演候选阶段任务缺少候选批次上下文。");
      }
      if (mode === "refine") {
        await this.deps.candidateStageService.refineCandidates({
          ...baseRequest,
          previousBatches,
          presets: candidateStage?.presets ?? [],
          feedback,
        });
        return;
      }
      if (!candidateStage?.batchId || !candidateStage?.candidateId || !feedback) {
        throw new Error("自动导演候选阶段任务缺少定向修正所需上下文。");
      }
      if (mode === "patch_candidate") {
        await this.deps.candidateStageService.patchCandidate({
          ...baseRequest,
          previousBatches,
          batchId: candidateStage.batchId,
          candidateId: candidateStage.candidateId,
          presets: candidateStage.presets ?? [],
          feedback,
        });
        return;
      }
      await this.deps.candidateStageService.refineCandidateTitleOptions({
        ...baseRequest,
        previousBatches,
        batchId: candidateStage.batchId,
        candidateId: candidateStage.candidateId,
        feedback,
      });
    });
    return true;
  }

  async runWithFailureHandling<T>(
    workflowTaskId: string | null | undefined,
    runner: () => Promise<T>,
    runtimeNode?: DirectorCandidateStageNode,
  ): Promise<T> {
    const taskId = workflowTaskId?.trim() || null;
    const adapter = runtimeNode ? getDirectorCandidateNodeAdapter(runtimeNode) : null;
    if (taskId && adapter) {
      await this.deps.directorRuntime.initializeRun({
        taskId,
        entrypoint: "candidate_stage",
        policyMode: "run_next_step",
        summary: "自动导演候选阶段已进入统一运行时。",
      });
    }
    try {
      if (taskId && adapter) {
        return await this.deps.runtimeOrchestrator.runNode<T>({
          ...adapter,
          taskId,
          runner: () => this.deps.withWorkflowTaskUsage(workflowTaskId, runner),
          collectArtifacts: () => [],
        });
      }
      return await this.deps.withWorkflowTaskUsage(workflowTaskId, runner);
    } catch (error) {
      if (taskId && !isDirectorRuntimeGateError(error)) {
        const message = error instanceof Error ? error.message : "自动导演候选阶段执行失败。";
        await this.deps.workflowService.markTaskFailed(taskId, message);
      }
      throw error;
    }
  }

  private isCandidateSelectionTask(input: {
    novelId?: string | null;
    checkpointType: string | null;
    currentItemKey?: string | null;
    seedPayload: DirectorWorkflowSeedPayload;
  }): boolean {
    if (input.novelId?.trim()) {
      return false;
    }

    const currentItemKey = input.currentItemKey?.trim() || null;
    const isCandidateStageItem = currentItemKey === "auto_director"
      || (currentItemKey?.startsWith("candidate_") ?? false);
    const directorSessionPhase = input.seedPayload.directorSession?.phase;

    if (directorSessionPhase && directorSessionPhase !== "candidate_selection") {
      return false;
    }

    if (currentItemKey && !isCandidateStageItem && input.checkpointType !== "candidate_selection_required") {
      return false;
    }

    if (input.checkpointType === "candidate_selection_required" && (isCandidateStageItem || !currentItemKey)) {
      return true;
    }
    if (directorSessionPhase === "candidate_selection") {
      return true;
    }
    if (input.seedPayload.candidateStage) {
      return !currentItemKey || isCandidateStageItem;
    }
    return isCandidateStageItem;
  }

  private buildCandidateStageBaseRequest(
    taskId: string,
    seedPayload: DirectorWorkflowSeedPayload,
  ): DirectorCandidatesRequest | null {
    const idea = readText(seedPayload.idea);
    if (!idea) {
      return null;
    }
    const llm = getDirectorLlmOptionsFromSeedPayload(seedPayload);
    const runMode = typeof seedPayload.runMode === "string"
      && (DIRECTOR_RUN_MODES as readonly string[]).includes(seedPayload.runMode)
      ? seedPayload.runMode as (typeof DIRECTOR_RUN_MODES)[number]
      : undefined;
    const commercialTags = Array.isArray(seedPayload.commercialTags)
      ? seedPayload.commercialTags.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : undefined;
    const continuationBookAnalysisSections = Array.isArray(seedPayload.continuationBookAnalysisSections)
      ? seedPayload.continuationBookAnalysisSections.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : undefined;
    return {
      workflowTaskId: taskId,
      idea,
      title: readText(seedPayload.title),
      description: readText(seedPayload.description),
      targetAudience: readText(seedPayload.targetAudience),
      bookSellingPoint: readText(seedPayload.bookSellingPoint),
      competingFeel: readText(seedPayload.competingFeel),
      first30ChapterPromise: readText(seedPayload.first30ChapterPromise),
      commercialTags,
      genreId: readText(seedPayload.genreId),
      primaryStoryModeId: readText(seedPayload.primaryStoryModeId),
      secondaryStoryModeId: readText(seedPayload.secondaryStoryModeId),
      worldId: readText(seedPayload.worldId),
      writingMode: seedPayload.writingMode === "continuation" ? "continuation" : "original",
      projectMode: seedPayload.projectMode === "ai_led"
        || seedPayload.projectMode === "co_pilot"
        || seedPayload.projectMode === "draft_mode"
        || seedPayload.projectMode === "auto_pipeline"
        ? seedPayload.projectMode
        : undefined,
      narrativePov: seedPayload.narrativePov === "first_person"
        || seedPayload.narrativePov === "third_person"
        || seedPayload.narrativePov === "mixed"
        ? seedPayload.narrativePov
        : undefined,
      pacePreference: seedPayload.pacePreference === "slow"
        || seedPayload.pacePreference === "balanced"
        || seedPayload.pacePreference === "fast"
        ? seedPayload.pacePreference
        : undefined,
      styleTone: readText(seedPayload.styleTone),
      styleProfileId: readText(seedPayload.styleProfileId),
      styleIntentSummary: seedPayload.styleIntentSummary as DirectorCandidatesRequest["styleIntentSummary"] | undefined,
      emotionIntensity: seedPayload.emotionIntensity === "low"
        || seedPayload.emotionIntensity === "medium"
        || seedPayload.emotionIntensity === "high"
        ? seedPayload.emotionIntensity
        : undefined,
      aiFreedom: seedPayload.aiFreedom === "low"
        || seedPayload.aiFreedom === "medium"
        || seedPayload.aiFreedom === "high"
        ? seedPayload.aiFreedom
        : undefined,
      defaultChapterLength: typeof seedPayload.defaultChapterLength === "number"
        ? seedPayload.defaultChapterLength
        : undefined,
      estimatedChapterCount: typeof seedPayload.estimatedChapterCount === "number"
        ? seedPayload.estimatedChapterCount
        : undefined,
      projectStatus: seedPayload.projectStatus === "not_started"
        || seedPayload.projectStatus === "in_progress"
        || seedPayload.projectStatus === "completed"
        || seedPayload.projectStatus === "rework"
        || seedPayload.projectStatus === "blocked"
        ? seedPayload.projectStatus
        : undefined,
      storylineStatus: seedPayload.storylineStatus === "not_started"
        || seedPayload.storylineStatus === "in_progress"
        || seedPayload.storylineStatus === "completed"
        || seedPayload.storylineStatus === "rework"
        || seedPayload.storylineStatus === "blocked"
        ? seedPayload.storylineStatus
        : undefined,
      outlineStatus: seedPayload.outlineStatus === "not_started"
        || seedPayload.outlineStatus === "in_progress"
        || seedPayload.outlineStatus === "completed"
        || seedPayload.outlineStatus === "rework"
        || seedPayload.outlineStatus === "blocked"
        ? seedPayload.outlineStatus
        : undefined,
      resourceReadyScore: typeof seedPayload.resourceReadyScore === "number"
        ? seedPayload.resourceReadyScore
        : undefined,
      sourceNovelId: readText(seedPayload.sourceNovelId),
      sourceKnowledgeDocumentId: readText(seedPayload.sourceKnowledgeDocumentId),
      continuationBookAnalysisId: readText(seedPayload.continuationBookAnalysisId),
      continuationBookAnalysisSections: continuationBookAnalysisSections as DirectorCandidatesRequest["continuationBookAnalysisSections"],
      provider: llm?.provider,
      model: llm?.model,
      temperature: llm?.temperature,
      runMode,
    };
  }
}
