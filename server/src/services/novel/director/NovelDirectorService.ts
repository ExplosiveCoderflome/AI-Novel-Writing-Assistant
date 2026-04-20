import {
  DIRECTOR_RUN_MODES,
} from "@ai-novel/shared/types/novelDirector";
import { AppError } from "../../../middleware/errorHandler";
import { runWithLlmUsageTracking } from "../../../llm/usageTracking";
import type {
  DirectorContinuationMode,
  BookSpec,
  DirectorCandidateBatch,
  DirectorCandidatePatchRequest,
  DirectorCandidatePatchResponse,
  DirectorCandidateTitleRefineRequest,
  DirectorCandidateTitleRefineResponse,
  DirectorCandidatesRequest,
  DirectorCandidatesResponse,
  DirectorConfirmApiResponse,
  DirectorConfirmRequest,
  DirectorRefineResponse,
  DirectorRefinementRequest,
  DirectorTakeoverReadinessResponse,
  DirectorTakeoverRequest,
  DirectorTakeoverResponse,
} from "@ai-novel/shared/types/novelDirector";
import { BookContractService } from "../BookContractService";
import { CharacterPreparationService } from "../characterPrep/CharacterPreparationService";
import { generateAutoCharacterCastDraft, persistCharacterCastOptionsDraft } from "../characterPrep/characterCastGeneration";
import { CharacterDynamicsService } from "../dynamics/CharacterDynamicsService";
import { NovelContextService } from "../NovelContextService";
import { NovelService } from "../NovelService";
import { novelFramingSuggestionService } from "../NovelFramingSuggestionService";
import { StoryMacroPlanService } from "../storyMacro/StoryMacroPlanService";
import { NovelVolumeService } from "../volume/NovelVolumeService";
import { isChapterTitleDiversityIssue } from "../volume/chapterTitleDiversity";
import { NovelWorkflowService } from "../workflow/NovelWorkflowService";
import {
  buildNovelEditResumeTarget,
  parseSeedPayload,
  parseResumeTarget,
} from "../workflow/novelWorkflow.shared";
import { NovelDirectorCandidateStageService } from "./novelDirectorCandidateStage";
import { resolveDirectorBookFraming } from "./novelDirectorFraming";
import {
  buildDirectorSessionState,
  buildWorkflowSeedPayload,
  getDirectorInputFromSeedPayload,
  getDirectorLlmOptionsFromSeedPayload,
  type DirectorWorkflowSeedPayload,
  normalizeDirectorRunMode,
  toBookSpec,
} from "./novelDirectorHelpers";
import {
  runDirectorCharacterSetupPhase,
  runDirectorStructuredOutlinePhase,
  runDirectorVolumeStrategyPhase,
} from "./novelDirectorPipelinePhases";
import { runDirectorStoryMacroPhase } from "./novelDirectorStoryMacroPhase";
import {
  DIRECTOR_PROGRESS,
  type DirectorProgressItemKey,
} from "./novelDirectorProgress";
import {
  buildDirectorTakeoverInput,
  buildDirectorTakeoverReadiness,
} from "./novelDirectorTakeover";
import { NovelDirectorAutoExecutionRuntime } from "./novelDirectorAutoExecutionRuntime";
import {
  loadDirectorTakeoverState,
  resolveDirectorRunningStateForPhase,
} from "./novelDirectorTakeoverRuntime";
import { DirectorRecoveryNotNeededError } from "./novelDirectorErrors";
import { repairDirectorChapterTitles } from "./novelDirectorChapterTitleRepair";
import { startDirectorTakeoverExecution } from "./novelDirectorTakeoverExecution";
import { resetDirectorTakeoverCurrentStep } from "./novelDirectorTakeoverReset";

type WorkflowTaskSnapshot = Awaited<ReturnType<NovelWorkflowService["getTaskByIdWithoutHealing"]>>;

const DIRECTOR_CONFIRM_DUPLICATE_WAIT_MS = 150;
const DIRECTOR_CONFIRM_DUPLICATE_ATTEMPTS = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function parseResumeTargetLike(value: unknown) {
  if (typeof value === "string") {
    return parseResumeTarget(value);
  }
  if (value && typeof value === "object") {
    return value as NonNullable<ReturnType<typeof parseResumeTarget>>;
  }
  return null;
}

function isWorkflowTaskCancelledError(error: unknown): boolean {
  return error instanceof AppError
    && error.statusCode === 409
    && error.message === "WORKFLOW_TASK_CANCELLED";
}

export class NovelDirectorService {
  private readonly novelContextService = new NovelContextService();
  private readonly characterPreparationService = new CharacterPreparationService();
  private readonly storyMacroService = new StoryMacroPlanService();
  private readonly bookContractService = new BookContractService();
  private readonly novelService = new NovelService();
  private readonly characterDynamicsService = new CharacterDynamicsService();
  private readonly volumeService = new NovelVolumeService();
  private readonly workflowService = new NovelWorkflowService();
  private readonly candidateStageService = new NovelDirectorCandidateStageService(this.workflowService);
  private readonly autoExecutionRuntime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: this.novelContextService,
    novelService: this.novelService,
    workflowService: this.workflowService,
    buildDirectorSeedPayload: (input, novelId, extra) => this.buildDirectorSeedPayload(input, novelId, extra),
  });

  private scheduleBackgroundRun(taskId: string, runner: () => Promise<void>) {
    void Promise.resolve()
      .then(() => runWithLlmUsageTracking({ workflowTaskId: taskId }, runner))
      .catch(async (error) => {
        if (isWorkflowTaskCancelledError(error)) {
          return;
        }
        const message = error instanceof Error ? error.message : "自动导演后台任务执行失败。";
        await this.workflowService.markTaskFailed(taskId, message);
      });
  }

  private withWorkflowTaskUsage<T>(workflowTaskId: string | null | undefined, runner: () => Promise<T>): Promise<T> {
    if (!workflowTaskId?.trim()) {
      return runner();
    }
    return runWithLlmUsageTracking({ workflowTaskId: workflowTaskId.trim() }, runner);
  }

  private resolveDirectorEditStage(
    phase: "story_macro" | "character_setup" | "volume_strategy" | "structured_outline" | "front10_ready",
  ): "story_macro" | "character" | "outline" | "structured" | "chapter" {
    if (phase === "story_macro") {
      return "story_macro";
    }
    if (phase === "character_setup") {
      return "character";
    }
    if (phase === "volume_strategy") {
      return "outline";
    }
    if (phase === "structured_outline") {
      return "structured";
    }
    return "chapter";
  }

  private async getDirectorAssetSnapshot(novelId: string) {
    const [characters, chapters, workspace] = await Promise.all([
      this.novelContextService.listCharacters(novelId),
      this.novelContextService.listChapters(novelId),
      this.volumeService.getVolumes(novelId).catch(() => null),
    ]);
    const firstVolume = workspace?.volumes[0] ?? null;
    return {
      characterCount: characters.length,
      chapterCount: chapters.length,
      volumeCount: workspace?.volumes.length ?? 0,
      firstVolumeId: firstVolume?.id ?? null,
      firstVolumeChapterCount: firstVolume?.chapters.length ?? 0,
    };
  }

  private async resolveResumePhase(input: {
    novelId: string;
    checkpointType: string | null;
    directorSessionPhase?: "candidate_selection" | "story_macro" | "character_setup" | "volume_strategy" | "structured_outline" | "front10_ready";
  }): Promise<"story_macro" | "character_setup" | "volume_strategy" | "structured_outline"> {
    if (input.checkpointType === "character_setup_required") {
      const characters = await this.novelContextService.listCharacters(input.novelId);
      if (characters.length === 0) {
        return "character_setup";
      }
      return "volume_strategy";
    }
    if (input.checkpointType === "volume_strategy_ready") {
      return "structured_outline";
    }
    if (input.checkpointType === "front10_ready") {
      const assets = await this.getDirectorAssetSnapshot(input.novelId);
      if (assets.characterCount === 0) {
        return "character_setup";
      }
      if (assets.chapterCount === 0 || assets.firstVolumeChapterCount === 0) {
        return assets.volumeCount > 0 ? "structured_outline" : "volume_strategy";
      }
      throw new DirectorRecoveryNotNeededError();
    }
    if (
      input.directorSessionPhase === "story_macro"
      || input.directorSessionPhase === "character_setup"
      || input.directorSessionPhase === "volume_strategy"
      || input.directorSessionPhase === "structured_outline"
    ) {
      return input.directorSessionPhase;
    }
    throw new Error("当前检查点不支持继续自动导演。");
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
    const readText = (value: unknown): string | undefined => (
      typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
    );
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

  private async continueCandidateStageTask(
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

    this.scheduleBackgroundRun(taskId, async () => {
      if (mode === "generate") {
        await this.candidateStageService.generateCandidates(baseRequest);
        return;
      }
      if (previousBatches.length === 0) {
        throw new Error("自动导演候选阶段任务缺少候选批次上下文。");
      }
      if (mode === "refine") {
        await this.candidateStageService.refineCandidates({
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
        await this.candidateStageService.patchCandidate({
          ...baseRequest,
          previousBatches,
          batchId: candidateStage.batchId,
          candidateId: candidateStage.candidateId,
          presets: candidateStage.presets ?? [],
          feedback,
        });
        return;
      }
      await this.candidateStageService.refineCandidateTitleOptions({
        ...baseRequest,
        previousBatches,
        batchId: candidateStage.batchId,
        candidateId: candidateStage.candidateId,
        feedback,
      });
    });
    return true;
  }

  private async runCandidateStageWithFailureHandling<T>(
    workflowTaskId: string | null | undefined,
    runner: () => Promise<T>,
  ): Promise<T> {
    try {
      return await this.withWorkflowTaskUsage(workflowTaskId, runner);
    } catch (error) {
      if (workflowTaskId?.trim()) {
        const message = error instanceof Error ? error.message : "自动导演候选阶段执行失败。";
        await this.workflowService.markTaskFailed(workflowTaskId.trim(), message);
      }
      throw error;
    }
  }

  async continueTask(taskId: string, input?: {
    continuationMode?: DirectorContinuationMode;
  }): Promise<void> {
    const row = await this.workflowService.getTaskByIdWithoutHealing(taskId);
    if (!row) {
      throw new Error("自动导演任务不存在。");
    }
    if (row.lane !== "auto_director") {
      await this.workflowService.continueTask(taskId);
      return;
    }
    if (row.status === "running" && !row.pendingManualRecovery) {
      return;
    }

    const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(row.seedPayloadJson) ?? {};
    const directorInput = getDirectorInputFromSeedPayload(seedPayload);
    const novelId = row.novelId ?? seedPayload.novelId ?? null;
    const resumedCandidateStage = await this.continueCandidateStageTask(taskId, {
      novelId,
      status: row.status,
      checkpointType: row.checkpointType,
      currentItemKey: row.currentItemKey,
      seedPayload,
    });
    if (resumedCandidateStage) {
      return;
    }
    if (!directorInput || !novelId) {
      throw new Error("自动导演任务缺少恢复所需上下文。");
    }
    const fallbackRunMode = typeof seedPayload.runMode === "string"
      && (DIRECTOR_RUN_MODES as readonly string[]).includes(seedPayload.runMode)
      ? seedPayload.runMode as (typeof DIRECTOR_RUN_MODES)[number]
      : undefined;
    const runMode = normalizeDirectorRunMode(directorInput.runMode ?? fallbackRunMode);
    const directorSessionPhase = seedPayload.directorSession?.phase;
    const shouldContinueAutoExecution = (
      input?.continuationMode === "auto_execute_range"
      || input?.continuationMode === "auto_execute_front10"
      || (
        runMode === "auto_to_execution"
        && (
          row.checkpointType === "front10_ready"
          || row.checkpointType === "chapter_batch_ready"
          || directorSessionPhase === "front10_ready"
        )
      )
    );
    if (
      shouldContinueAutoExecution
      && (
        row.checkpointType === "front10_ready"
        || row.checkpointType === "chapter_batch_ready"
        || directorSessionPhase === "front10_ready"
      )
    ) {
      const resumeCheckpointType = row.checkpointType === "chapter_batch_ready" || row.checkpointType === "replan_required"
        ? row.checkpointType
        : "front10_ready";
      const resumedChapterId = (
        parseResumeTargetLike(row.resumeTargetJson)?.chapterId
        ?? parseResumeTargetLike(seedPayload.resumeTarget)?.chapterId
        ?? seedPayload.autoExecution?.nextChapterId
        ?? null
      );
      await this.workflowService.markTaskRunning(taskId, {
        stage: resumeCheckpointType === "replan_required" ? "quality_repair" : "chapter_execution",
        itemKey: resumeCheckpointType === "replan_required" ? "quality_repair" : "chapter_execution",
        itemLabel: resumeCheckpointType === "replan_required"
          ? "正在恢复当前质量修复批次"
          : "正在恢复当前章节批次",
        progress: resumeCheckpointType === "replan_required" ? 0.975 : 0.93,
        clearCheckpoint: resumeCheckpointType === "chapter_batch_ready" || resumeCheckpointType === "replan_required",
        seedPayload: this.buildDirectorSeedPayload(directorInput, novelId, {
          directorSession: buildDirectorSessionState({
            runMode: directorInput.runMode,
            phase: "front10_ready",
            isBackgroundRunning: true,
          }),
          resumeTarget: buildNovelEditResumeTarget({
            novelId,
            taskId,
            stage: "pipeline",
            chapterId: resumedChapterId,
          }),
          autoExecution: seedPayload.autoExecution ?? null,
        }),
      });
      this.scheduleBackgroundRun(taskId, async () => {
        await this.autoExecutionRuntime.runFromReady({
          taskId,
          novelId,
          request: directorInput,
          existingPipelineJobId: seedPayload.autoExecution?.pipelineJobId ?? null,
          existingState: seedPayload.autoExecution ?? null,
          resumeCheckpointType,
          previousFailureMessage: row.lastError ?? null,
          allowSkipReviewBlockedChapter: input?.continuationMode === "auto_execute_range"
            || input?.continuationMode === "auto_execute_front10",
        });
      });
      return;
    }

    const phase = await this.resolveResumePhase({
      novelId,
      checkpointType: row.checkpointType,
      directorSessionPhase: seedPayload.directorSession?.phase,
    });

    const directorSession = buildDirectorSessionState({
      runMode: directorInput.runMode,
      phase,
      isBackgroundRunning: true,
    });
    const resumeTarget = buildNovelEditResumeTarget({
      novelId,
      taskId,
      stage: this.resolveDirectorEditStage(phase),
    });
    await this.workflowService.bootstrapTask({
      workflowTaskId: taskId,
      novelId,
      lane: "auto_director",
      title: directorInput.candidate.workingTitle,
      seedPayload: this.buildDirectorSeedPayload(directorInput, novelId, {
        directorSession,
        resumeTarget,
      }),
    });
    await this.workflowService.markTaskRunning(taskId, resolveDirectorRunningStateForPhase(phase));
    this.scheduleBackgroundRun(taskId, async () => {
      await this.runDirectorPipeline({
        taskId,
        novelId,
        input: directorInput,
        startPhase: phase,
      });
    });
  }

  async repairChapterTitles(taskId: string, input?: {
    volumeId?: string | null;
  }): Promise<void> {
    const row = await this.workflowService.getTaskById(taskId);
    if (!row) {
      throw new Error("当前自动导演任务不存在。");
    }
    if (row.lane !== "auto_director") {
      throw new Error("只有自动导演任务支持 AI 修复章节标题。");
    }
    if (row.status === "running") {
      throw new Error("当前自动导演仍在运行中，请等待当前步骤完成后再发起标题修复。");
    }

    const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(row.seedPayloadJson) ?? {};
    const directorInput = getDirectorInputFromSeedPayload(seedPayload);
    const novelId = row.novelId ?? seedPayload.novelId ?? null;
    if (!directorInput || !novelId) {
      throw new Error("当前自动导演任务缺少恢复 AI 修复所需的上下文。");
    }

    const notice = seedPayload.taskNotice;
    const taskHasTitleWarning = notice?.code === "CHAPTER_TITLE_DIVERSITY"
      || isChapterTitleDiversityIssue(row.lastError);
    if (!taskHasTitleWarning) {
      throw new Error("当前任务没有可直接 AI 修复的章节标题提醒。");
    }

    const requestedVolumeId = input?.volumeId?.trim() || null;
    const resumeTarget = mergeResumeTargets(
      parseResumeTarget(row.resumeTargetJson),
      parseResumeTargetLike(seedPayload.resumeTarget),
    );
    const targetVolumeId = requestedVolumeId
      || notice?.action?.volumeId?.trim()
      || resumeTarget?.volumeId?.trim()
      || null;
    if (!targetVolumeId) {
      throw new Error("当前任务缺少待修复的目标卷，无法继续 AI 修复章节标题。");
    }

    const workspace = await this.volumeService.getVolumes(novelId);
    const targetVolume = workspace.volumes.find((volume) => volume.id === targetVolumeId);
    if (!targetVolume) {
      throw new Error("当前任务指向的目标卷不存在，无法继续 AI 修复章节标题。");
    }

    const boundLlm = getDirectorLlmOptionsFromSeedPayload(seedPayload);
    const repairRequest: DirectorConfirmRequest = {
      ...directorInput,
      provider: boundLlm?.provider ?? directorInput.provider,
      model: boundLlm?.model ?? directorInput.model,
      temperature: typeof boundLlm?.temperature === "number"
        ? boundLlm.temperature
        : directorInput.temperature,
    };
    const directorSession = buildDirectorSessionState({
      runMode: repairRequest.runMode,
      phase: "structured_outline",
      isBackgroundRunning: true,
    });
    const resumeTargetForRepair = buildNovelEditResumeTarget({
      novelId,
      taskId,
      stage: "structured",
      volumeId: targetVolume.id,
    });
    await this.workflowService.bootstrapTask({
      workflowTaskId: taskId,
      novelId,
      lane: "auto_director",
      title: repairRequest.candidate.workingTitle,
      seedPayload: this.buildDirectorSeedPayload(repairRequest, novelId, {
        directorSession,
        resumeTarget: resumeTargetForRepair,
        taskNotice: null,
      }),
    });
    await this.workflowService.markTaskRunning(taskId, {
      stage: "structured_outline",
      itemKey: "chapter_list",
      itemLabel: `正在 AI 修复第 ${targetVolume.sortOrder} 卷章节标题`,
      progress: DIRECTOR_PROGRESS.chapterList,
      clearCheckpoint: true,
    });
    this.scheduleBackgroundRun(taskId, async () => {
      await repairDirectorChapterTitles({
        taskId,
        novelId,
        targetVolumeId: targetVolume.id,
        request: repairRequest,
        volumeService: this.volumeService,
        workflowService: this.workflowService,
        buildDirectorSeedPayload: (request, targetNovelId, extra) => (
          this.buildDirectorSeedPayload(request, targetNovelId, extra)
        ),
      });
    });
  }

  async getTakeoverReadiness(novelId: string): Promise<DirectorTakeoverReadinessResponse> {
    const takeoverState = await loadDirectorTakeoverState({
      novelId,
      getStoryMacroPlan: (targetNovelId) => this.storyMacroService.getPlan(targetNovelId),
      getDirectorAssetSnapshot: (targetNovelId) => this.getDirectorAssetSnapshot(targetNovelId),
      getVolumeWorkspace: (targetNovelId) => this.volumeService.getVolumes(targetNovelId),
      findActiveAutoDirectorTask: (targetNovelId) => this.workflowService.findActiveTaskByNovelAndLane(targetNovelId, "auto_director"),
      findLatestAutoDirectorTask: (targetNovelId) => this.workflowService.findLatestVisibleTaskByNovelId(targetNovelId, "auto_director"),
    });
    return buildDirectorTakeoverReadiness({
      novel: takeoverState.novel,
      snapshot: takeoverState.snapshot,
      hasActiveTask: takeoverState.hasActiveTask,
      activeTaskId: takeoverState.activeTaskId,
      activePipelineJob: takeoverState.activePipelineJob,
      latestCheckpoint: takeoverState.latestCheckpoint,
      executableRange: takeoverState.executableRange,
    });
  }

  async startTakeover(input: DirectorTakeoverRequest): Promise<DirectorTakeoverResponse> {
    const takeoverState = await loadDirectorTakeoverState({
      novelId: input.novelId,
      getStoryMacroPlan: (targetNovelId) => this.storyMacroService.getPlan(targetNovelId),
      getDirectorAssetSnapshot: (targetNovelId) => this.getDirectorAssetSnapshot(targetNovelId),
      getVolumeWorkspace: (targetNovelId) => this.volumeService.getVolumes(targetNovelId),
      findActiveAutoDirectorTask: (targetNovelId) => this.workflowService.findActiveTaskByNovelAndLane(targetNovelId, "auto_director"),
      findLatestAutoDirectorTask: (targetNovelId) => this.workflowService.findLatestVisibleTaskByNovelId(targetNovelId, "auto_director"),
    });
    if (takeoverState.hasActiveTask) {
      throw new Error("当前已有自动导演任务在运行或等待审核，请先继续或取消当前任务。");
    }

    const directorInput = buildDirectorTakeoverInput({
      novel: takeoverState.novel,
      storyMacroPlan: takeoverState.storyMacroPlan,
      bookContract: takeoverState.bookContract,
      runMode: input.runMode,
    });
    return startDirectorTakeoverExecution({
      request: input,
      takeoverState,
      directorInput: {
        ...directorInput,
        autoExecutionPlan: input.autoExecutionPlan,
        provider: input.provider ?? directorInput.provider,
        model: input.model?.trim() || directorInput.model,
        temperature: typeof input.temperature === "number" ? input.temperature : directorInput.temperature,
      },
      workflowService: this.workflowService,
      autoExecutionRuntime: this.autoExecutionRuntime,
      buildDirectorSeedPayload: (request, novelId, extra) => this.buildDirectorSeedPayload(request, novelId, extra),
      scheduleBackgroundRun: (taskId, runner) => this.scheduleBackgroundRun(taskId, runner),
      runDirectorPipeline: (payload) => this.runDirectorPipeline(payload),
      prepareRestartStep: async ({ plan, takeoverState: currentTakeoverState, directorInput }) => {
        await resetDirectorTakeoverCurrentStep({
          novelId: input.novelId,
          plan,
          takeoverState: currentTakeoverState,
          deps: {
            getVolumeWorkspace: (targetNovelId) => this.volumeService.getVolumes(targetNovelId),
            updateVolumeWorkspace: (targetNovelId, payload) => this.volumeService.updateVolumes(targetNovelId, payload),
            cancelPipelineJob: (jobId) => this.novelService.cancelPipelineJob(jobId),
          },
        });
      },
    });
  }

  async generateCandidates(input: DirectorCandidatesRequest): Promise<DirectorCandidatesResponse> {
    return this.runCandidateStageWithFailureHandling(
      input.workflowTaskId,
      () => this.candidateStageService.generateCandidates(input),
    );
  }

  async refineCandidates(input: DirectorRefinementRequest): Promise<DirectorRefineResponse> {
    return this.runCandidateStageWithFailureHandling(
      input.workflowTaskId,
      () => this.candidateStageService.refineCandidates(input),
    );
  }

  async patchCandidate(input: DirectorCandidatePatchRequest): Promise<DirectorCandidatePatchResponse> {
    return this.runCandidateStageWithFailureHandling(
      input.workflowTaskId,
      () => this.candidateStageService.patchCandidate(input),
    );
  }

  async refineCandidateTitleOptions(
    input: DirectorCandidateTitleRefineRequest,
  ): Promise<DirectorCandidateTitleRefineResponse> {
    return this.runCandidateStageWithFailureHandling(
      input.workflowTaskId,
      () => this.candidateStageService.refineCandidateTitleOptions(input),
    );
  }

  async confirmCandidate(input: DirectorConfirmRequest): Promise<DirectorConfirmApiResponse> {
    const runMode = normalizeDirectorRunMode(input.runMode);
    const title = input.candidate.workingTitle.trim() || input.title?.trim() || "未命名项目";
    const description = input.description?.trim() || input.candidate.logline.trim();
    const bookSpec = toBookSpec(
      input.candidate,
      input.idea,
      input.estimatedChapterCount,
    );
    const workflowTask = await this.workflowService.bootstrapTask({
      workflowTaskId: input.workflowTaskId,
      lane: "auto_director",
      title,
      seedPayload: this.buildDirectorSeedPayload({ ...input, runMode }, null, {
        directorSession: buildDirectorSessionState({
          runMode,
          phase: "candidate_selection",
          isBackgroundRunning: false,
        }),
      }),
    });

    if (workflowTask.novelId) {
      return this.buildExistingConfirmResponse(workflowTask, input, bookSpec);
    }

    const novelCreationClaim = await this.workflowService.claimAutoDirectorNovelCreation(workflowTask.id, {
      itemLabel: "正在创建小说项目",
      progress: DIRECTOR_PROGRESS.novelCreate,
    });
    if (novelCreationClaim.status === "attached") {
      return this.buildExistingConfirmResponse(novelCreationClaim.task, input, bookSpec);
    }
    if (novelCreationClaim.status === "in_progress") {
      const existingTask = await this.waitForExistingConfirmedNovel(workflowTask.id);
      if (existingTask?.novelId) {
        return this.buildExistingConfirmResponse(existingTask, input, bookSpec);
      }
      if (existingTask?.status === "failed" || existingTask?.status === "cancelled") {
        throw new Error(existingTask.lastError?.trim() || "当前导演建书流程已中断，请重新尝试。");
      }
      throw new Error("当前导演方案正在创建小说，请勿重复提交。");
    }

    try {
      return await this.withWorkflowTaskUsage(workflowTask.id, async () => {
        const resolvedBookFraming = await resolveDirectorBookFraming({
          context: input,
          title,
          description,
          suggest: (suggestInput) => novelFramingSuggestionService.suggest({
            ...suggestInput,
            provider: input.provider,
            model: input.model,
            temperature: input.temperature,
          }),
        });
        const directorInput: DirectorConfirmRequest = {
          ...input,
          ...resolvedBookFraming,
          runMode,
        };

        await this.markDirectorTaskRunning(
          workflowTask.id,
          "auto_director",
          "novel_create",
          "正在创建小说项目",
          DIRECTOR_PROGRESS.novelCreate,
        );
        const createdNovel = await this.novelContextService.createNovel({
          title,
          description,
          targetAudience: resolvedBookFraming.targetAudience,
          bookSellingPoint: resolvedBookFraming.bookSellingPoint,
          competingFeel: resolvedBookFraming.competingFeel,
          first30ChapterPromise: resolvedBookFraming.first30ChapterPromise,
          commercialTags: resolvedBookFraming.commercialTags,
          genreId: input.genreId?.trim() || undefined,
          primaryStoryModeId: input.primaryStoryModeId?.trim() || undefined,
          secondaryStoryModeId: input.secondaryStoryModeId?.trim() || undefined,
          worldId: input.worldId?.trim() || undefined,
          writingMode: input.writingMode,
          projectMode: input.projectMode,
          narrativePov: input.narrativePov,
          pacePreference: input.pacePreference,
          styleTone: input.styleTone?.trim() || undefined,
          emotionIntensity: input.emotionIntensity,
          aiFreedom: input.aiFreedom,
          defaultChapterLength: input.defaultChapterLength,
          estimatedChapterCount: input.estimatedChapterCount ?? bookSpec.targetChapterCount,
          projectStatus: input.projectStatus,
          storylineStatus: input.storylineStatus,
          outlineStatus: input.outlineStatus,
          resourceReadyScore: input.resourceReadyScore,
          sourceNovelId: input.sourceNovelId ?? undefined,
          sourceKnowledgeDocumentId: input.sourceKnowledgeDocumentId ?? undefined,
          continuationBookAnalysisId: input.continuationBookAnalysisId ?? undefined,
          continuationBookAnalysisSections: input.continuationBookAnalysisSections ?? undefined,
        });
        await this.workflowService.attachNovelToTask(workflowTask.id, createdNovel.id, "project_setup");
        const directorSession = buildDirectorSessionState({
          runMode,
          phase: "story_macro",
          isBackgroundRunning: true,
        });
        const resumeTarget = buildNovelEditResumeTarget({
          novelId: createdNovel.id,
          taskId: workflowTask.id,
          stage: "story_macro",
        });
        await this.workflowService.bootstrapTask({
          workflowTaskId: workflowTask.id,
          novelId: createdNovel.id,
          lane: "auto_director",
          title,
          seedPayload: this.buildDirectorSeedPayload(directorInput, createdNovel.id, {
            directorSession,
            resumeTarget,
          }),
        });
        await this.markDirectorTaskRunning(
          workflowTask.id,
          "story_macro",
          "book_contract",
          "正在准备 Book Contract 与故事宏观规划",
          DIRECTOR_PROGRESS.bookContract,
        );
        this.scheduleBackgroundRun(workflowTask.id, async () => {
          await this.runDirectorPipeline({
            taskId: workflowTask.id,
            novelId: createdNovel.id,
            input: directorInput,
            startPhase: "story_macro",
          });
        });
        const novel = await this.novelContextService.getNovelById(createdNovel.id) as unknown as DirectorConfirmApiResponse["novel"];
        const seededPlanDigests = {
          book: null,
          arcs: [],
          chapters: [],
        };

        return {
          novel,
          storyMacroPlan: null,
          bookSpec,
          batch: {
            id: input.batchId,
            round: input.round,
          },
          createdChapterCount: 0,
          createdArcCount: 0,
          workflowTaskId: workflowTask.id,
          directorSession,
          resumeTarget,
          plans: seededPlanDigests,
          seededPlans: seededPlanDigests,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "自动导演确认链执行失败。";
      await this.workflowService.markTaskFailed(workflowTask.id, message);
      throw error;
    }
  }

  private async buildExistingConfirmResponse(
    task: WorkflowTaskSnapshot,
    input: DirectorConfirmRequest,
    bookSpec: BookSpec,
  ): Promise<DirectorConfirmApiResponse> {
    if (!task?.novelId) {
      throw new Error("自动导演确认链缺少已创建的小说项目。");
    }
    const novel = await this.novelContextService.getNovelById(task.novelId) as unknown as DirectorConfirmApiResponse["novel"];
    if (!novel) {
      throw new Error("自动导演确认链未能读取已创建的小说项目。");
    }
    const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(task.seedPayloadJson) ?? {};
    const directorSession = seedPayload.directorSession ?? buildDirectorSessionState({
      runMode: normalizeDirectorRunMode(input.runMode),
      phase: "story_macro",
      isBackgroundRunning: true,
    });
    const resumeTarget = parseResumeTarget(task.resumeTargetJson) ?? buildNovelEditResumeTarget({
      novelId: task.novelId,
      taskId: task.id,
      stage: "story_macro",
    });
    const seededPlanDigests = {
      book: null,
      arcs: [],
      chapters: [],
    };

    return {
      novel,
      storyMacroPlan: null,
      bookSpec,
      batch: {
        id: input.batchId,
        round: input.round,
      },
      createdChapterCount: 0,
      createdArcCount: 0,
      workflowTaskId: task.id,
      directorSession,
      resumeTarget,
      plans: seededPlanDigests,
      seededPlans: seededPlanDigests,
    };
  }

  private async waitForExistingConfirmedNovel(taskId: string): Promise<WorkflowTaskSnapshot> {
    for (let attempt = 0; attempt < DIRECTOR_CONFIRM_DUPLICATE_ATTEMPTS; attempt += 1) {
      const task = await this.workflowService.getTaskByIdWithoutHealing(taskId);
      if (!task || task.novelId || task.status === "failed" || task.status === "cancelled") {
        return task;
      }
      await sleep(DIRECTOR_CONFIRM_DUPLICATE_WAIT_MS);
    }
    return this.workflowService.getTaskByIdWithoutHealing(taskId);
  }

  private buildDirectorSeedPayload(
    input: DirectorConfirmRequest,
    novelId: string | null,
    extra?: Record<string, unknown>,
  ) {
    const directorSessionPhase = extra?.directorSession
      && typeof extra.directorSession === "object"
      && "phase" in extra.directorSession
      ? (extra.directorSession as { phase?: unknown }).phase
      : null;
    const shouldClearCandidateStage = Boolean(novelId)
      || (
        typeof directorSessionPhase === "string"
        && directorSessionPhase !== "candidate_selection"
      );
    const nextCandidateStage = shouldClearCandidateStage
      ? null
      : (Object.prototype.hasOwnProperty.call(extra ?? {}, "candidateStage")
          ? (extra as { candidateStage?: unknown }).candidateStage
          : undefined);

    return buildWorkflowSeedPayload(input, {
      novelId,
      candidate: input.candidate,
      batch: {
        id: input.batchId,
        round: input.round,
      },
      directorInput: input,
      ...extra,
      candidateStage: nextCandidateStage,
    });
  }

  private async markDirectorTaskRunning(
    taskId: string,
    stage: "auto_director" | "story_macro" | "character_setup" | "volume_strategy" | "structured_outline",
    itemKey: DirectorProgressItemKey,
    itemLabel: string,
    progress: number,
    options?: {
      chapterId?: string | null;
      volumeId?: string | null;
    },
  ) {
    await this.workflowService.markTaskRunning(taskId, {
      stage,
      itemKey,
      itemLabel,
      progress,
      chapterId: options?.chapterId,
      volumeId: options?.volumeId,
    });
  }

  private async runDirectorPipeline(input: {
    taskId: string;
    novelId: string;
    input: DirectorConfirmRequest;
    startPhase: "story_macro" | "character_setup" | "volume_strategy" | "structured_outline";
  }) {
    if (input.startPhase === "story_macro") {
      await this.runStoryMacroPhase(input.taskId, input.novelId, input.input);
    }

    if (input.startPhase === "story_macro" || input.startPhase === "character_setup") {
      const paused = await this.runCharacterSetupPhase(input.taskId, input.novelId, input.input);
      if (paused) {
        return;
      }
    }

    if (
      input.startPhase === "story_macro"
      || input.startPhase === "character_setup"
      || input.startPhase === "volume_strategy"
    ) {
      const volumeWorkspace = await this.runVolumeStrategyPhase(input.taskId, input.novelId, input.input);
      if (!volumeWorkspace) {
        return;
      }
      await this.runStructuredOutlinePhase(input.taskId, input.novelId, input.input, volumeWorkspace);
      if (normalizeDirectorRunMode(input.input.runMode) === "auto_to_execution") {
        await this.autoExecutionRuntime.runFromReady({
          taskId: input.taskId,
          novelId: input.novelId,
          request: input.input,
          resumeCheckpointType: "front10_ready",
        });
      }
      return;
    }

    const currentWorkspace = await this.volumeService.getVolumes(input.novelId);
    await this.runStructuredOutlinePhase(input.taskId, input.novelId, input.input, currentWorkspace);
    if (normalizeDirectorRunMode(input.input.runMode) === "auto_to_execution") {
      await this.autoExecutionRuntime.runFromReady({
        taskId: input.taskId,
        novelId: input.novelId,
        request: input.input,
        resumeCheckpointType: "front10_ready",
      });
    }
  }

  private async runStoryMacroPhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ): Promise<void> {
    await runDirectorStoryMacroPhase({
      taskId,
      novelId,
      request: input,
      dependencies: {
        storyMacroService: this.storyMacroService,
        bookContractService: this.bookContractService,
      },
      callbacks: {
        markDirectorTaskRunning: (runningTaskId, stage, itemKey, itemLabel, progress) => (
          this.markDirectorTaskRunning(runningTaskId, stage, itemKey, itemLabel, progress)
        ),
      },
    });
  }

  private buildDirectorCharacterPreparationService() {
    return {
      generateAutoCharacterCastOption: async (targetNovelId: string, options: {
        provider?: DirectorConfirmRequest["provider"];
        model?: string;
        temperature?: number;
        storyInput?: string;
      }) => {
        const generated = await generateAutoCharacterCastDraft(targetNovelId, options);
        await persistCharacterCastOptionsDraft(targetNovelId, generated.storyInput, {
          options: [generated.parsed.option],
        });
        const [persistedOption] = await this.characterPreparationService.listCharacterCastOptions(targetNovelId);
        if (!persistedOption) {
          throw new Error("Auto director character cast option was not persisted.");
        }
        return persistedOption;
      },
      assessCharacterCastOptions: (...args: Parameters<CharacterPreparationService["assessCharacterCastOptions"]>) => (
        this.characterPreparationService.assessCharacterCastOptions(...args)
      ),
      applyCharacterCastOption: (...args: Parameters<CharacterPreparationService["applyCharacterCastOption"]>) => (
        this.characterPreparationService.applyCharacterCastOption(...args)
      ),
    };
  }

  private async runCharacterSetupPhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ): Promise<boolean> {
    return runDirectorCharacterSetupPhase({
      taskId,
      novelId,
      request: input,
      dependencies: {
        workflowService: this.workflowService,
        novelContextService: this.novelContextService,
        characterDynamicsService: this.characterDynamicsService,
        characterPreparationService: this.buildDirectorCharacterPreparationService(),
        volumeService: this.volumeService,
      },
      callbacks: {
        buildDirectorSeedPayload: (request, takeoverNovelId, extra) => this.buildDirectorSeedPayload(request, takeoverNovelId, extra),
        markDirectorTaskRunning: (runningTaskId, stage, itemKey, itemLabel, progress) => (
          this.markDirectorTaskRunning(runningTaskId, stage, itemKey, itemLabel, progress)
        ),
      },
    });
  }

  private async runVolumeStrategyPhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ) {
    return runDirectorVolumeStrategyPhase({
      taskId,
      novelId,
      request: input,
      dependencies: {
        workflowService: this.workflowService,
        novelContextService: this.novelContextService,
        characterDynamicsService: this.characterDynamicsService,
        characterPreparationService: this.buildDirectorCharacterPreparationService(),
        volumeService: this.volumeService,
      },
      callbacks: {
        buildDirectorSeedPayload: (request, takeoverNovelId, extra) => this.buildDirectorSeedPayload(request, takeoverNovelId, extra),
        markDirectorTaskRunning: (runningTaskId, stage, itemKey, itemLabel, progress) => (
          this.markDirectorTaskRunning(runningTaskId, stage, itemKey, itemLabel, progress)
        ),
      },
    });
  }

  private async runStructuredOutlinePhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
    baseWorkspace: Awaited<ReturnType<NovelVolumeService["getVolumes"]>>,
  ) {
    await runDirectorStructuredOutlinePhase({
      taskId,
      novelId,
      request: input,
      baseWorkspace,
      dependencies: {
        workflowService: this.workflowService,
        novelContextService: this.novelContextService,
        characterDynamicsService: this.characterDynamicsService,
        characterPreparationService: this.buildDirectorCharacterPreparationService(),
        volumeService: this.volumeService,
      },
      callbacks: {
        buildDirectorSeedPayload: (request, takeoverNovelId, extra) => this.buildDirectorSeedPayload(request, takeoverNovelId, extra),
        markDirectorTaskRunning: (runningTaskId, stage, itemKey, itemLabel, progress) => (
          this.markDirectorTaskRunning(runningTaskId, stage, itemKey, itemLabel, progress)
        ),
      },
    });
  }

  // Director 侧 JSON 输出解析/修复统一由 invokeStructuredLlm 完成，
  // 不再维护 extractJSONObject/JSON.parse 的重复逻辑。
}
