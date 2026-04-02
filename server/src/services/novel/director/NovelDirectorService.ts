import {
  DIRECTOR_RUN_MODES,
} from "@ai-novel/shared/types/novelDirector";
import type {
  DirectorContinuationMode,
  BookSpec,
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
import { NovelContextService } from "../NovelContextService";
import { NovelService } from "../NovelService";
import { novelFramingSuggestionService } from "../NovelFramingSuggestionService";
import { StoryMacroPlanService } from "../storyMacro/StoryMacroPlanService";
import { NovelVolumeService } from "../volume/NovelVolumeService";
import { NovelWorkflowService } from "../workflow/NovelWorkflowService";
import {
  buildNovelEditResumeTarget,
  parseSeedPayload,
} from "../workflow/novelWorkflow.shared";
import { NovelDirectorCandidateStageService } from "./novelDirectorCandidateStage";
import { resolveDirectorBookFraming } from "./novelDirectorFraming";
import {
  buildDirectorSessionState,
  buildWorkflowSeedPayload,
  getDirectorInputFromSeedPayload,
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
  assertDirectorTakeoverPhaseAvailable,
  buildDirectorTakeoverInput,
  buildDirectorTakeoverReadiness,
} from "./novelDirectorTakeover";
import {
  buildDirectorAutoExecutionPipelineOptions,
  resolveDirectorAutoExecutionRange,
  resolveDirectorAutoExecutionWorkflowState,
  type DirectorAutoExecutionRange,
} from "./novelDirectorAutoExecution";
import {
  loadDirectorTakeoverState,
  resolveDirectorRunningStateForPhase,
} from "./novelDirectorTakeoverRuntime";

export class NovelDirectorService {
  private readonly novelContextService = new NovelContextService();
  private readonly characterPreparationService = new CharacterPreparationService();
  private readonly storyMacroService = new StoryMacroPlanService();
  private readonly bookContractService = new BookContractService();
  private readonly novelService = new NovelService();
  private readonly volumeService = new NovelVolumeService();
  private readonly workflowService = new NovelWorkflowService();
  private readonly candidateStageService = new NovelDirectorCandidateStageService(this.workflowService);

  private scheduleBackgroundRun(taskId: string, runner: () => Promise<void>) {
    void Promise.resolve()
      .then(runner)
      .catch(async (error) => {
        const message = error instanceof Error ? error.message : "自动导演后台任务执行失败。";
        await this.workflowService.markTaskFailed(taskId, message);
      });
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

  private async resolveAutoExecutionRange(novelId: string): Promise<DirectorAutoExecutionRange> {
    const chapters = await this.novelContextService.listChapters(novelId);
    const range = resolveDirectorAutoExecutionRange(chapters);
    if (!range) {
      throw new Error("当前还没有可自动执行的章节，请先完成前 10 章拆章同步。");
    }
    return range;
  }

  private async syncAutoExecutionTaskState(input: {
    taskId: string;
    novelId: string;
    request: DirectorConfirmRequest;
    range: DirectorAutoExecutionRange;
    isBackgroundRunning: boolean;
    pipelineJobId?: string | null;
    pipelineStatus?: string | null;
    resumeStage?: "chapter" | "pipeline";
  }) {
    const directorSession = buildDirectorSessionState({
      runMode: input.request.runMode,
      phase: "front10_ready",
      isBackgroundRunning: input.isBackgroundRunning,
    });
    const resumeTarget = buildNovelEditResumeTarget({
      novelId: input.novelId,
      taskId: input.taskId,
      stage: input.resumeStage ?? "pipeline",
      chapterId: input.range.firstChapterId,
    });
    await this.workflowService.bootstrapTask({
      workflowTaskId: input.taskId,
      novelId: input.novelId,
      lane: "auto_director",
      title: input.request.candidate.workingTitle,
      seedPayload: this.buildDirectorSeedPayload(input.request, input.novelId, {
        directorSession,
        resumeTarget,
        autoExecution: {
          enabled: true,
          startOrder: input.range.startOrder,
          endOrder: input.range.endOrder,
          totalChapterCount: input.range.totalChapterCount,
          pipelineJobId: input.pipelineJobId ?? null,
          pipelineStatus: input.pipelineStatus ?? null,
        },
      }),
    });
  }

  private async shouldStopAutoExecution(taskId: string, pipelineJobId?: string | null): Promise<boolean> {
    const row = await this.workflowService.getTaskById(taskId);
    if (!row || row.status !== "cancelled") {
      return false;
    }
    if (pipelineJobId) {
      await this.novelService.cancelPipelineJob(pipelineJobId).catch(() => null);
    }
    return true;
  }

  private async runAutoExecutionFromReady(input: {
    taskId: string;
    novelId: string;
    request: DirectorConfirmRequest;
    existingPipelineJobId?: string | null;
  }): Promise<void> {
    const range = await this.resolveAutoExecutionRange(input.novelId);
    let pipelineJobId = input.existingPipelineJobId?.trim() || "";

    try {
      await this.syncAutoExecutionTaskState({
        taskId: input.taskId,
        novelId: input.novelId,
        request: input.request,
        range,
        isBackgroundRunning: true,
        pipelineJobId: pipelineJobId || null,
        pipelineStatus: pipelineJobId ? "running" : "queued",
      });
      if (await this.shouldStopAutoExecution(input.taskId, pipelineJobId || null)) {
        return;
      }

      if (pipelineJobId) {
        const existingJob = await this.novelService.getPipelineJobById(pipelineJobId);
        if (!existingJob || existingJob.status === "failed" || existingJob.status === "cancelled" || existingJob.status === "succeeded") {
          pipelineJobId = "";
        }
      }

      if (!pipelineJobId) {
        await this.workflowService.markTaskRunning(input.taskId, {
          stage: "chapter_execution",
          itemKey: "chapter_execution",
          itemLabel: `正在自动执行前 ${range.totalChapterCount} 章`,
          progress: 0.93,
        });
        const job = await this.novelService.startPipelineJob(
          input.novelId,
          buildDirectorAutoExecutionPipelineOptions({
            provider: input.request.provider,
            model: input.request.model,
            temperature: input.request.temperature,
            startOrder: range.startOrder,
            endOrder: range.endOrder,
          }),
        );
        pipelineJobId = job.id;
        await this.syncAutoExecutionTaskState({
          taskId: input.taskId,
          novelId: input.novelId,
          request: input.request,
          range,
          isBackgroundRunning: true,
          pipelineJobId,
          pipelineStatus: job.status,
        });
      }

      while (pipelineJobId) {
        if (await this.shouldStopAutoExecution(input.taskId, pipelineJobId)) {
          return;
        }
        const job = await this.novelService.getPipelineJobById(pipelineJobId);
        if (!job) {
          throw new Error("自动执行前 10 章时未能找到对应的批量任务。");
        }
        if (job.status === "queued" || job.status === "running") {
          const runningState = resolveDirectorAutoExecutionWorkflowState(job, range);
          await this.workflowService.markTaskRunning(input.taskId, runningState);
          await this.syncAutoExecutionTaskState({
            taskId: input.taskId,
            novelId: input.novelId,
            request: input.request,
            range,
            isBackgroundRunning: true,
            pipelineJobId,
            pipelineStatus: job.status,
            resumeStage: "pipeline",
          });
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }

        if (job.status === "succeeded") {
          await this.workflowService.recordCheckpoint(input.taskId, {
            stage: "quality_repair",
            checkpointType: "workflow_completed",
            checkpointSummary: `《${input.request.candidate.workingTitle.trim() || input.request.title?.trim() || "当前项目"}》已自动完成前 ${range.totalChapterCount} 章章节执行与质量修复。`,
            itemLabel: `前 ${range.totalChapterCount} 章自动执行完成`,
            progress: 1,
            chapterId: range.firstChapterId,
            seedPayload: this.buildDirectorSeedPayload(input.request, input.novelId, {
              directorSession: buildDirectorSessionState({
                runMode: input.request.runMode,
                phase: "front10_ready",
                isBackgroundRunning: false,
              }),
              resumeTarget: buildNovelEditResumeTarget({
                novelId: input.novelId,
                taskId: input.taskId,
                stage: "pipeline",
                chapterId: range.firstChapterId,
              }),
              autoExecution: {
                enabled: true,
                startOrder: range.startOrder,
                endOrder: range.endOrder,
                totalChapterCount: range.totalChapterCount,
                pipelineJobId,
                pipelineStatus: job.status,
              },
            }),
          });
          return;
        }

        const failureMessage = job.error?.trim()
          || (job.status === "cancelled"
            ? "前 10 章自动执行已取消。"
            : "前 10 章自动执行未能全部通过质量要求。");
        await this.workflowService.markTaskFailed(input.taskId, failureMessage, {
          stage: "quality_repair",
          itemKey: "quality_repair",
          itemLabel: `前 ${range.totalChapterCount} 章自动执行已暂停`,
          checkpointType: "chapter_batch_ready",
          checkpointSummary: `前 ${range.totalChapterCount} 章已进入自动执行，但当前批量任务未完全完成：${failureMessage}`,
          chapterId: range.firstChapterId,
          progress: 0.98,
        });
        await this.syncAutoExecutionTaskState({
          taskId: input.taskId,
          novelId: input.novelId,
          request: input.request,
          range,
          isBackgroundRunning: false,
          pipelineJobId,
          pipelineStatus: job.status,
          resumeStage: "pipeline",
        });
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.message === "DIRECTOR_AUTO_EXECUTION_CANCELLED") {
        return;
      }
      throw error;
    }
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
      throw new Error("当前导演产物已经完整，无需继续自动导演。");
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

  async continueTask(taskId: string, input?: {
    continuationMode?: DirectorContinuationMode;
  }): Promise<void> {
    const row = await this.workflowService.getTaskById(taskId);
    if (!row) {
      throw new Error("自动导演任务不存在。");
    }
    if (row.lane !== "auto_director") {
      await this.workflowService.continueTask(taskId);
      return;
    }
    if (row.status === "running") {
      return;
    }

    const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(row.seedPayloadJson) ?? {};
    const directorInput = getDirectorInputFromSeedPayload(seedPayload);
    const novelId = row.novelId ?? seedPayload.novelId ?? null;
    if (!directorInput || !novelId) {
      throw new Error("自动导演任务缺少恢复所需上下文。");
    }
    const fallbackRunMode = typeof seedPayload.runMode === "string"
      && (DIRECTOR_RUN_MODES as readonly string[]).includes(seedPayload.runMode)
      ? seedPayload.runMode as (typeof DIRECTOR_RUN_MODES)[number]
      : undefined;
    const runMode = normalizeDirectorRunMode(directorInput.runMode ?? fallbackRunMode);
    const shouldContinueAutoExecution = (
      input?.continuationMode === "auto_execute_front10"
      || (
        runMode === "auto_to_execution"
        && (row.checkpointType === "front10_ready" || row.checkpointType === "chapter_batch_ready")
      )
    );
    if (shouldContinueAutoExecution && (row.checkpointType === "front10_ready" || row.checkpointType === "chapter_batch_ready")) {
      await this.runAutoExecutionFromReady({
        taskId,
        novelId,
        request: directorInput,
        existingPipelineJobId: seedPayload.autoExecution?.pipelineJobId ?? null,
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
      seedPayload: buildWorkflowSeedPayload(directorInput, {
        novelId,
        candidate: directorInput.candidate,
        batch: {
          id: directorInput.batchId,
          round: directorInput.round,
        },
        directorInput,
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

  async getTakeoverReadiness(novelId: string): Promise<DirectorTakeoverReadinessResponse> {
    const takeoverState = await loadDirectorTakeoverState({
      novelId,
      getStoryMacroPlan: (targetNovelId) => this.storyMacroService.getPlan(targetNovelId),
      getDirectorAssetSnapshot: (targetNovelId) => this.getDirectorAssetSnapshot(targetNovelId),
      findActiveAutoDirectorTask: (targetNovelId) => this.workflowService.findActiveTaskByNovelAndLane(targetNovelId, "auto_director"),
    });
    return buildDirectorTakeoverReadiness({
      novel: takeoverState.novel,
      snapshot: takeoverState.snapshot,
      hasActiveTask: takeoverState.hasActiveTask,
      activeTaskId: takeoverState.activeTaskId,
    });
  }

  async startTakeover(input: DirectorTakeoverRequest): Promise<DirectorTakeoverResponse> {
    const takeoverState = await loadDirectorTakeoverState({
      novelId: input.novelId,
      getStoryMacroPlan: (targetNovelId) => this.storyMacroService.getPlan(targetNovelId),
      getDirectorAssetSnapshot: (targetNovelId) => this.getDirectorAssetSnapshot(targetNovelId),
      findActiveAutoDirectorTask: (targetNovelId) => this.workflowService.findActiveTaskByNovelAndLane(targetNovelId, "auto_director"),
    });
    if (takeoverState.hasActiveTask) {
      throw new Error("当前已有自动导演任务在运行或等待审核，请先继续或取消当前任务。");
    }

    const readiness = buildDirectorTakeoverReadiness({
      novel: takeoverState.novel,
      snapshot: takeoverState.snapshot,
      hasActiveTask: false,
      activeTaskId: null,
    });
    assertDirectorTakeoverPhaseAvailable(readiness, input.startPhase);

    const directorInput = buildDirectorTakeoverInput({
      novel: takeoverState.novel,
      storyMacroPlan: takeoverState.storyMacroPlan,
      bookContract: takeoverState.bookContract,
      runMode: input.runMode,
    });
    const directorSession = buildDirectorSessionState({
      runMode: directorInput.runMode,
      phase: input.startPhase,
      isBackgroundRunning: true,
    });
    const resumeTarget = buildNovelEditResumeTarget({
      novelId: input.novelId,
      stage: this.resolveDirectorEditStage(input.startPhase),
      volumeId: input.startPhase === "structured_outline" ? takeoverState.snapshot.firstVolumeId : null,
    });
    const workflowTask = await this.workflowService.bootstrapTask({
      novelId: input.novelId,
      lane: "auto_director",
      title: takeoverState.novel.title,
      forceNew: true,
      seedPayload: this.buildDirectorSeedPayload(
        {
          ...directorInput,
          provider: input.provider ?? directorInput.provider,
          model: input.model?.trim() || directorInput.model,
          temperature: typeof input.temperature === "number" ? input.temperature : directorInput.temperature,
        },
        input.novelId,
        {
          directorSession,
          resumeTarget,
          takeover: {
            source: "existing_novel",
            startPhase: input.startPhase,
          },
        },
      ),
    });
    const runningState = resolveDirectorRunningStateForPhase(input.startPhase);
    await this.workflowService.markTaskRunning(workflowTask.id, runningState);
    this.scheduleBackgroundRun(workflowTask.id, async () => {
      await this.runDirectorPipeline({
        taskId: workflowTask.id,
        novelId: input.novelId,
        input: {
          ...directorInput,
          provider: input.provider ?? directorInput.provider,
          model: input.model?.trim() || directorInput.model,
          temperature: typeof input.temperature === "number" ? input.temperature : directorInput.temperature,
        },
        startPhase: input.startPhase,
      });
    });

    return {
      novelId: input.novelId,
      workflowTaskId: workflowTask.id,
      startPhase: input.startPhase,
      directorSession,
      resumeTarget: {
        ...resumeTarget,
        taskId: workflowTask.id,
      },
    };
  }

  async generateCandidates(input: DirectorCandidatesRequest): Promise<DirectorCandidatesResponse> {
    return this.candidateStageService.generateCandidates(input);
  }

  async refineCandidates(input: DirectorRefinementRequest): Promise<DirectorRefineResponse> {
    return this.candidateStageService.refineCandidates(input);
  }

  async patchCandidate(input: DirectorCandidatePatchRequest): Promise<DirectorCandidatePatchResponse> {
    return this.candidateStageService.patchCandidate(input);
  }

  async refineCandidateTitleOptions(
    input: DirectorCandidateTitleRefineRequest,
  ): Promise<DirectorCandidateTitleRefineResponse> {
    return this.candidateStageService.refineCandidateTitleOptions(input);
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

    try {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "自动导演确认链执行失败。";
      await this.workflowService.markTaskFailed(workflowTask.id, message);
      throw error;
    }
  }

  private buildDirectorSeedPayload(
    input: DirectorConfirmRequest,
    novelId: string | null,
    extra?: Record<string, unknown>,
  ) {
    return buildWorkflowSeedPayload(input, {
      novelId,
      candidate: input.candidate,
      batch: {
        id: input.batchId,
        round: input.round,
      },
      directorInput: input,
      ...extra,
    });
  }

  private async markDirectorTaskRunning(
    taskId: string,
    stage: "auto_director" | "story_macro" | "character_setup" | "volume_strategy" | "structured_outline",
    itemKey: DirectorProgressItemKey,
    itemLabel: string,
    progress: number,
  ) {
    await this.workflowService.markTaskRunning(taskId, {
      stage,
      itemKey,
      itemLabel,
      progress,
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
        await this.runAutoExecutionFromReady({
          taskId: input.taskId,
          novelId: input.novelId,
          request: input.input,
        });
      }
      return;
    }

    const currentWorkspace = await this.volumeService.getVolumes(input.novelId);
    await this.runStructuredOutlinePhase(input.taskId, input.novelId, input.input, currentWorkspace);
    if (normalizeDirectorRunMode(input.input.runMode) === "auto_to_execution") {
      await this.runAutoExecutionFromReady({
        taskId: input.taskId,
        novelId: input.novelId,
        request: input.input,
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
        characterPreparationService: this.characterPreparationService,
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
        characterPreparationService: this.characterPreparationService,
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
        characterPreparationService: this.characterPreparationService,
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
