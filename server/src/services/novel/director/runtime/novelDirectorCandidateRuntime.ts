import { DirectorTaskStateWriter } from "../state";
import {
  DIRECTOR_RUN_MODES,
  type DirectorCandidateBatch,
  type DirectorCandidatesRequest,
} from "@ai-novel/shared/types/novelDirector";
import type { NovelWorkflowService } from "../../workflow/NovelWorkflowService";
import {
  getDirectorLlmOptionsFromSeedPayload,
  type DirectorWorkflowSeedPayload,
} from "./novelDirectorHelpers";
import type { NovelDirectorCandidateStageService } from "../phases/novelDirectorCandidateStage";
import type { DirectorRuntimeService } from "./DirectorRuntimeService";
import {
  type DirectorCandidateStageNode,
} from "../phases/novelDirectorCandidateNodeAdapters";
import {
  isDirectorRuntimeGateError,
  type NovelDirectorRuntimeOrchestrator,
} from "./novelDirectorRuntimeOrchestrator";
import { getDirectorCandidateStepModule } from "../workflowStepRuntime/directorWorkflowStepModules";

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
      directorTaskData: DirectorWorkflowSeedPayload;
    },
  ): Promise<boolean> {
    if (!this.isCandidateSelectionTask({
      novelId: input.novelId,
      checkpointType: input.checkpointType,
      currentItemKey: input.currentItemKey,
      directorTaskData: input.directorTaskData,
    })) {
      return false;
    }
    if (input.checkpointType === "candidate_selection_required" || input.status === "waiting_approval") {
      return true;
    }
    const baseRequest = this.buildCandidateStageBaseRequest(taskId, input.directorTaskData);
    if (!baseRequest) {
      throw new Error("自动导演候选阶段任务缺少恢复所需上下文。");
    }
    const candidateStage = input.directorTaskData.candidateStage;
    const previousBatches = Array.isArray(input.directorTaskData.batches)
      ? input.directorTaskData.batches as DirectorCandidateBatch[]
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
    const module = runtimeNode ? getDirectorCandidateStepModule(runtimeNode) : null;
    if (taskId && module) {
      await this.deps.directorRuntime.initializeRun({
        taskId,
        entrypoint: "candidate_stage",
        policyMode: "run_next_step",
        summary: "自动导演候选阶段已进入统一运行时。",
      });
    }
    try {
      if (taskId && module) {
        return await this.deps.runtimeOrchestrator.runStepModule<T>({
          module,
          taskId,
          reuseCompletedStep: false,
          runner: () => this.deps.withWorkflowTaskUsage(workflowTaskId, runner),
          collectArtifacts: () => [],
        });
      }
      return await this.deps.withWorkflowTaskUsage(workflowTaskId, runner);
    } catch (error) {
      if (taskId && !isDirectorRuntimeGateError(error)) {
        const message = error instanceof Error ? error.message : "自动导演候选阶段执行失败。";
        await new DirectorTaskStateWriter(this.deps.workflowService).markFailed(taskId, message);
      }
      throw error;
    }
  }

  private isCandidateSelectionTask(input: {
    novelId?: string | null;
    checkpointType: string | null;
    currentItemKey?: string | null;
    directorTaskData: DirectorWorkflowSeedPayload;
  }): boolean {
    if (input.novelId?.trim()) {
      return false;
    }

    const currentItemKey = input.currentItemKey?.trim() || null;
    const isCandidateStageItem = currentItemKey === "auto_director"
      || (currentItemKey?.startsWith("candidate_") ?? false);
    const directorSessionPhase = input.directorTaskData.directorSession?.phase;

    if (directorSessionPhase === "candidate_selection") {
      return true;
    }

    if (directorSessionPhase) {
      return false;
    }

    if (currentItemKey && !isCandidateStageItem && input.checkpointType !== "candidate_selection_required") {
      return false;
    }

    if (input.checkpointType === "candidate_selection_required" && (isCandidateStageItem || !currentItemKey)) {
      return true;
    }
    if (input.directorTaskData.candidateStage) {
      return !currentItemKey || isCandidateStageItem;
    }
    return isCandidateStageItem;
  }

  private buildCandidateStageBaseRequest(
    taskId: string,
    directorTaskData: DirectorWorkflowSeedPayload,
  ): DirectorCandidatesRequest | null {
    const idea = readText(directorTaskData.idea);
    if (!idea) {
      return null;
    }
    const llm = getDirectorLlmOptionsFromSeedPayload(directorTaskData);
    const runMode = typeof directorTaskData.runMode === "string"
      && (DIRECTOR_RUN_MODES as readonly string[]).includes(directorTaskData.runMode)
      ? directorTaskData.runMode as (typeof DIRECTOR_RUN_MODES)[number]
      : undefined;
    const commercialTags = Array.isArray(directorTaskData.commercialTags)
      ? directorTaskData.commercialTags.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : undefined;
    const continuationBookAnalysisSections = Array.isArray(directorTaskData.continuationBookAnalysisSections)
      ? directorTaskData.continuationBookAnalysisSections.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : undefined;
    const referenceBookAnalysisSections = Array.isArray(directorTaskData.referenceBookAnalysisSections)
      ? directorTaskData.referenceBookAnalysisSections.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : undefined;
    return {
      workflowTaskId: taskId,
      idea,
      marketBriefId: readText(directorTaskData.marketBriefId),
      title: readText(directorTaskData.title),
      description: readText(directorTaskData.description),
      targetAudience: readText(directorTaskData.targetAudience),
      bookSellingPoint: readText(directorTaskData.bookSellingPoint),
      competingFeel: readText(directorTaskData.competingFeel),
      first30ChapterPromise: readText(directorTaskData.first30ChapterPromise),
      commercialTags,
      genreId: readText(directorTaskData.genreId),
      primaryStoryModeId: readText(directorTaskData.primaryStoryModeId),
      secondaryStoryModeId: readText(directorTaskData.secondaryStoryModeId),
      worldId: readText(directorTaskData.worldId),
      worldSetupMode: directorTaskData.worldSetupMode === "skip" ? "skip" : undefined,
      writingMode: directorTaskData.writingMode === "continuation" ? "continuation" : "original",
      projectMode: directorTaskData.projectMode === "ai_led"
        || directorTaskData.projectMode === "co_pilot"
        || directorTaskData.projectMode === "draft_mode"
        || directorTaskData.projectMode === "auto_pipeline"
        ? directorTaskData.projectMode
        : undefined,
      readerChannelPreference: directorTaskData.readerChannelPreference === "ai_judge"
        || directorTaskData.readerChannelPreference === "male_oriented"
        || directorTaskData.readerChannelPreference === "female_oriented"
        || directorTaskData.readerChannelPreference === "general"
        ? directorTaskData.readerChannelPreference
        : undefined,
      powerSystemPreference: directorTaskData.powerSystemPreference === "none"
        || directorTaskData.powerSystemPreference === "soft"
        || directorTaskData.powerSystemPreference === "ranked"
        ? directorTaskData.powerSystemPreference
        : "ai_recommend",
      narrativePov: directorTaskData.narrativePov === "first_person"
        || directorTaskData.narrativePov === "third_person"
        || directorTaskData.narrativePov === "mixed"
        ? directorTaskData.narrativePov
        : undefined,
      pacePreference: directorTaskData.pacePreference === "slow"
        || directorTaskData.pacePreference === "balanced"
        || directorTaskData.pacePreference === "fast"
        ? directorTaskData.pacePreference
        : undefined,
      styleTone: readText(directorTaskData.styleTone),
      styleProfileId: readText(directorTaskData.styleProfileId),
      styleIntentSummary: directorTaskData.styleIntentSummary as DirectorCandidatesRequest["styleIntentSummary"] | undefined,
      emotionIntensity: directorTaskData.emotionIntensity === "low"
        || directorTaskData.emotionIntensity === "medium"
        || directorTaskData.emotionIntensity === "high"
        ? directorTaskData.emotionIntensity
        : undefined,
      aiFreedom: directorTaskData.aiFreedom === "low"
        || directorTaskData.aiFreedom === "medium"
        || directorTaskData.aiFreedom === "high"
        ? directorTaskData.aiFreedom
        : undefined,
      postGenerationStyleReviewEnabled: typeof directorTaskData.postGenerationStyleReviewEnabled === "boolean"
        ? directorTaskData.postGenerationStyleReviewEnabled
        : undefined,
      defaultChapterLength: typeof directorTaskData.defaultChapterLength === "number"
        ? directorTaskData.defaultChapterLength
        : undefined,
      estimatedChapterCount: typeof directorTaskData.estimatedChapterCount === "number"
        ? directorTaskData.estimatedChapterCount
        : undefined,
      projectStatus: directorTaskData.projectStatus === "not_started"
        || directorTaskData.projectStatus === "in_progress"
        || directorTaskData.projectStatus === "completed"
        || directorTaskData.projectStatus === "rework"
        || directorTaskData.projectStatus === "blocked"
        ? directorTaskData.projectStatus
        : undefined,
      storylineStatus: directorTaskData.storylineStatus === "not_started"
        || directorTaskData.storylineStatus === "in_progress"
        || directorTaskData.storylineStatus === "completed"
        || directorTaskData.storylineStatus === "rework"
        || directorTaskData.storylineStatus === "blocked"
        ? directorTaskData.storylineStatus
        : undefined,
      outlineStatus: directorTaskData.outlineStatus === "not_started"
        || directorTaskData.outlineStatus === "in_progress"
        || directorTaskData.outlineStatus === "completed"
        || directorTaskData.outlineStatus === "rework"
        || directorTaskData.outlineStatus === "blocked"
        ? directorTaskData.outlineStatus
        : undefined,
      resourceReadyScore: typeof directorTaskData.resourceReadyScore === "number"
        ? directorTaskData.resourceReadyScore
        : undefined,
      sourceNovelId: readText(directorTaskData.sourceNovelId),
      sourceKnowledgeDocumentId: readText(directorTaskData.sourceKnowledgeDocumentId),
      continuationBookAnalysisId: readText(directorTaskData.continuationBookAnalysisId),
      continuationBookAnalysisSections: continuationBookAnalysisSections as DirectorCandidatesRequest["continuationBookAnalysisSections"],
      referenceBookAnalysisId: readText(directorTaskData.referenceBookAnalysisId),
      referenceBookAnalysisSections: referenceBookAnalysisSections as DirectorCandidatesRequest["referenceBookAnalysisSections"],
      provider: llm?.provider,
      model: llm?.model,
      temperature: llm?.temperature,
      runMode,
    };
  }
}
