import { randomUUID } from "node:crypto";
import type {
  BookSpec,
  DirectorCandidateBatch,
  DirectorCandidatesRequest,
  DirectorConfirmApiResponse,
  DirectorConfirmRequest,
  DirectorRefinementRequest,
} from "@ai-novel/shared/types/novelDirector";
import type { BookContractDraft } from "@ai-novel/shared/types/novelWorkflow";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  buildDirectorBookContractContextBlocks,
  buildDirectorCandidateContextBlocks,
  directorBookContractPrompt,
  directorCandidatePrompt,
} from "../../../prompting/prompts/novel/directorPlanning.prompts";
import { BookContractService } from "../BookContractService";
import { CharacterPreparationService } from "../characterPrep/CharacterPreparationService";
import { NovelContextService } from "../NovelContextService";
import { novelFramingSuggestionService } from "../NovelFramingSuggestionService";
import { StoryMacroPlanService } from "../storyMacro/StoryMacroPlanService";
import { NovelVolumeService } from "../volume/NovelVolumeService";
import { NovelWorkflowService } from "../workflow/NovelWorkflowService";
import {
  buildNovelEditResumeTarget,
  parseSeedPayload,
} from "../workflow/novelWorkflow.shared";
import { resolveDirectorBookFraming } from "./novelDirectorFraming";
import {
  buildDirectorSessionState,
  buildRefinementSummary,
  buildStoryInput,
  buildWorkflowSeedPayload,
  getDirectorInputFromSeedPayload,
  type DirectorWorkflowSeedPayload,
  enhanceCandidateTitles,
  type CandidateGenerationContext,
  normalizeDirectorRunMode,
  normalizeBookContract,
  normalizeCandidate,
  toBookSpec,
} from "./novelDirectorHelpers";
import {
  buildChapterDetailBundleLabel,
  buildChapterDetailBundleProgress,
  DIRECTOR_CHAPTER_DETAIL_MODES,
  DIRECTOR_PROGRESS,
  type DirectorProgressItemKey,
} from "./novelDirectorProgress";

export class NovelDirectorService {
  private readonly novelContextService = new NovelContextService();
  private readonly characterPreparationService = new CharacterPreparationService();
  private readonly storyMacroService = new StoryMacroPlanService();
  private readonly bookContractService = new BookContractService();
  private readonly volumeService = new NovelVolumeService();
  private readonly workflowService = new NovelWorkflowService();

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

  private async resolveResumePhase(input: {
    novelId: string;
    checkpointType: string | null;
    directorSessionPhase?: "candidate_selection" | "story_macro" | "character_setup" | "volume_strategy" | "structured_outline" | "front10_ready";
  }): Promise<"story_macro" | "character_setup" | "volume_strategy" | "structured_outline"> {
    if (input.checkpointType === "character_setup_required") {
      const characters = await this.novelContextService.listCharacters(input.novelId);
      if (characters.length === 0) {
        throw new Error("请先至少补齐 1 位角色，再继续自动导演。");
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

  async continueTask(taskId: string): Promise<void> {
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
    await this.workflowService.markTaskRunning(taskId, {
      stage: phase === "character_setup"
        ? "character_setup"
        : phase === "volume_strategy"
          ? "volume_strategy"
          : "structured_outline",
      itemKey: phase === "character_setup"
        ? "character_setup"
        : phase === "volume_strategy"
          ? "volume_strategy"
          : "beat_sheet",
      itemLabel: phase === "character_setup"
        ? "正在补齐角色准备"
        : phase === "volume_strategy"
          ? "正在继续生成卷战略"
          : "正在继续生成第 1 卷节奏板与细化",
      progress: phase === "character_setup"
        ? DIRECTOR_PROGRESS.characterSetup
        : phase === "volume_strategy"
          ? DIRECTOR_PROGRESS.volumeStrategy
          : DIRECTOR_PROGRESS.beatSheet,
    });
    this.scheduleBackgroundRun(taskId, async () => {
      await this.runDirectorPipeline({
        taskId,
        novelId,
        input: directorInput,
        startPhase: phase,
      });
    });
  }

  async generateCandidates(input: DirectorCandidatesRequest) {
    const batch = await this.generateBatch({
      idea: input.idea,
      count: 2,
      batches: [],
      presets: [],
      request: input,
      options: input,
    });
    if (!input.workflowTaskId?.trim()) {
      return batch;
    }
    const workflowTask = await this.workflowService.bootstrapTask({
      workflowTaskId: input.workflowTaskId,
      lane: "auto_director",
      title: input.title ?? null,
      seedPayload: buildWorkflowSeedPayload(input, {
        batches: [batch.batch],
      }),
    });
    await this.workflowService.recordCandidateSelectionRequired(workflowTask.id, {
      summary: `${batch.batch.roundLabel} 已生成 ${batch.batch.candidates.length} 套书级方向。`,
      seedPayload: buildWorkflowSeedPayload(input, {
        batches: [batch.batch],
      }),
    });
    return {
      ...batch,
      workflowTaskId: workflowTask.id,
    };
  }

  async refineCandidates(input: DirectorRefinementRequest) {
    const batch = await this.generateBatch({
      idea: input.idea,
      count: 2,
      batches: input.previousBatches,
      presets: input.presets ?? [],
      feedback: input.feedback,
      request: input,
      options: input,
    });
    if (!input.workflowTaskId?.trim()) {
      return batch;
    }
    const workflowTask = await this.workflowService.bootstrapTask({
      workflowTaskId: input.workflowTaskId,
      lane: "auto_director",
      title: input.title ?? null,
      seedPayload: buildWorkflowSeedPayload(input, {
        batches: [...input.previousBatches, batch.batch],
      }),
    });
    await this.workflowService.recordCandidateSelectionRequired(workflowTask.id, {
      summary: `${batch.batch.roundLabel} 已根据修正意见生成 ${batch.batch.candidates.length} 套新方向。`,
      seedPayload: buildWorkflowSeedPayload(input, {
        batches: [...input.previousBatches, batch.batch],
      }),
    });
    return {
      ...batch,
      workflowTaskId: workflowTask.id,
    };
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
      return;
    }

    const currentWorkspace = await this.volumeService.getVolumes(input.novelId);
    await this.runStructuredOutlinePhase(input.taskId, input.novelId, input.input, currentWorkspace);
  }

  private async runStoryMacroPhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ): Promise<void> {
    const bookSpec = toBookSpec(input.candidate, input.idea, input.estimatedChapterCount);
    const storyInput = buildStoryInput(input, bookSpec);
    await this.markDirectorTaskRunning(
      taskId,
      "story_macro",
      "story_macro",
      "正在生成故事宏观规划",
      DIRECTOR_PROGRESS.storyMacro,
    );
    const storyMacroPlan = await this.storyMacroService.decompose(novelId, storyInput, input);
    await this.markDirectorTaskRunning(
      taskId,
      "story_macro",
      "constraint_engine",
      "正在构建约束引擎",
      DIRECTOR_PROGRESS.constraintEngine,
    );
    const hydratedStoryMacroPlan = await this.ensureConstraintEngine(novelId, storyMacroPlan);
    const bookContractDraft = await this.generateBookContract(input, bookSpec, hydratedStoryMacroPlan, storyInput);
    await this.bookContractService.upsert(novelId, bookContractDraft);
  }

  private async runCharacterSetupPhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ): Promise<boolean> {
    const directorSession = buildDirectorSessionState({
      runMode: input.runMode,
      phase: "character_setup",
      isBackgroundRunning: true,
    });
    const resumeTarget = buildNovelEditResumeTarget({
      novelId,
      taskId,
      stage: "character",
    });
    await this.workflowService.bootstrapTask({
      workflowTaskId: taskId,
      novelId,
      lane: "auto_director",
      title: input.candidate.workingTitle,
      seedPayload: this.buildDirectorSeedPayload(input, novelId, {
        directorSession,
        resumeTarget,
      }),
    });
    await this.markDirectorTaskRunning(
      taskId,
      "character_setup",
      "character_setup",
      "正在生成角色阵容",
      DIRECTOR_PROGRESS.characterSetup,
    );
    const castOptions = await this.characterPreparationService.generateCharacterCastOptions(novelId, {
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
      storyInput: buildStoryInput(input, toBookSpec(input.candidate, input.idea, input.estimatedChapterCount)),
    });
    const targetOption = castOptions[0];
    if (!targetOption) {
      throw new Error("自动导演未能生成可用角色阵容。");
    }
    await this.markDirectorTaskRunning(
      taskId,
      "character_setup",
      "character_cast_apply",
      `正在应用角色阵容「${targetOption.title}」`,
      DIRECTOR_PROGRESS.characterSetupReady,
    );
    await this.characterPreparationService.applyCharacterCastOption(novelId, targetOption.id);

    if (normalizeDirectorRunMode(input.runMode) !== "stage_review") {
      return false;
    }

    const pausedSession = buildDirectorSessionState({
      runMode: input.runMode,
      phase: "character_setup",
      isBackgroundRunning: false,
    });
    await this.workflowService.recordCheckpoint(taskId, {
      stage: "character_setup",
      checkpointType: "character_setup_required",
      checkpointSummary: `角色准备已生成并应用「${targetOption.title}」。建议先检查核心角色、关系与当前目标，再继续自动导演。`,
      itemLabel: "等待审核角色准备",
      progress: DIRECTOR_PROGRESS.characterSetupReady,
      seedPayload: this.buildDirectorSeedPayload(input, novelId, {
        directorSession: pausedSession,
        resumeTarget,
      }),
    });
    return true;
  }

  private async runVolumeStrategyPhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ) {
    const directorSession = buildDirectorSessionState({
      runMode: input.runMode,
      phase: "volume_strategy",
      isBackgroundRunning: true,
    });
    const resumeTarget = buildNovelEditResumeTarget({
      novelId,
      taskId,
      stage: "outline",
    });
    await this.workflowService.bootstrapTask({
      workflowTaskId: taskId,
      novelId,
      lane: "auto_director",
      title: input.candidate.workingTitle,
      seedPayload: this.buildDirectorSeedPayload(input, novelId, {
        directorSession,
        resumeTarget,
      }),
    });
    await this.markDirectorTaskRunning(
      taskId,
      "volume_strategy",
      "volume_strategy",
      "正在生成卷战略",
      DIRECTOR_PROGRESS.volumeStrategy,
    );
    let workspace = await this.volumeService.generateVolumes(novelId, {
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
      scope: "strategy",
      estimatedChapterCount: input.estimatedChapterCount ?? toBookSpec(input.candidate, input.idea, input.estimatedChapterCount).targetChapterCount,
    });
    await this.markDirectorTaskRunning(
      taskId,
      "volume_strategy",
      "volume_skeleton",
      "正在生成卷骨架",
      DIRECTOR_PROGRESS.volumeSkeleton,
    );
    workspace = await this.volumeService.generateVolumes(novelId, {
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
      scope: "skeleton",
      estimatedChapterCount: input.estimatedChapterCount ?? toBookSpec(input.candidate, input.idea, input.estimatedChapterCount).targetChapterCount,
      draftWorkspace: workspace,
    });
    const persistedStrategyWorkspace = await this.volumeService.updateVolumes(novelId, workspace);

    if (normalizeDirectorRunMode(input.runMode) !== "stage_review") {
      return persistedStrategyWorkspace;
    }

    const pausedSession = buildDirectorSessionState({
      runMode: input.runMode,
      phase: "volume_strategy",
      isBackgroundRunning: false,
    });
    await this.workflowService.recordCheckpoint(taskId, {
      stage: "volume_strategy",
      checkpointType: "volume_strategy_ready",
      checkpointSummary: `卷战略与卷骨架已生成，共 ${persistedStrategyWorkspace.volumes.length} 卷。确认无误后再继续第 1 卷节奏与拆章。`,
      itemLabel: "等待审核卷战略 / 卷骨架",
      progress: DIRECTOR_PROGRESS.volumeStrategyReady,
      seedPayload: this.buildDirectorSeedPayload(input, novelId, {
        directorSession: pausedSession,
        resumeTarget,
      }),
    });
    return null;
  }

  private async runStructuredOutlinePhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
    baseWorkspace: Awaited<ReturnType<NovelVolumeService["getVolumes"]>>,
  ) {
    const targetVolume = baseWorkspace.volumes[0];
    if (!targetVolume) {
      throw new Error("自动导演未能生成可用卷骨架。");
    }

    const directorSession = buildDirectorSessionState({
      runMode: input.runMode,
      phase: "structured_outline",
      isBackgroundRunning: true,
    });
    const runningResumeTarget = buildNovelEditResumeTarget({
      novelId,
      taskId,
      stage: "structured",
      volumeId: targetVolume.id,
    });
    await this.workflowService.bootstrapTask({
      workflowTaskId: taskId,
      novelId,
      lane: "auto_director",
      title: input.candidate.workingTitle,
      seedPayload: this.buildDirectorSeedPayload(input, novelId, {
        directorSession,
        resumeTarget: runningResumeTarget,
      }),
    });

    await this.markDirectorTaskRunning(
      taskId,
      "structured_outline",
      "beat_sheet",
      "正在生成第 1 卷节奏板",
      DIRECTOR_PROGRESS.beatSheet,
    );
    let workspace = await this.volumeService.generateVolumes(novelId, {
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
      scope: "beat_sheet",
      targetVolumeId: targetVolume.id,
      draftWorkspace: baseWorkspace,
    });
    await this.markDirectorTaskRunning(
      taskId,
      "structured_outline",
      "chapter_list",
      "正在生成第 1 卷章节列表",
      DIRECTOR_PROGRESS.chapterList,
    );
    workspace = await this.volumeService.generateVolumes(novelId, {
      provider: input.provider,
      model: input.model,
      temperature: input.temperature,
      scope: "chapter_list",
      targetVolumeId: targetVolume.id,
      draftWorkspace: workspace,
    });
    await this.markDirectorTaskRunning(
      taskId,
      "structured_outline",
      "chapter_sync",
      "正在同步第 1 卷章节到执行区",
      DIRECTOR_PROGRESS.chapterSync,
    );
    let persistedOutlineWorkspace = await this.volumeService.updateVolumes(novelId, workspace);
    await this.volumeService.syncVolumeChapters(novelId, {
      volumes: persistedOutlineWorkspace.volumes,
      preserveContent: true,
      applyDeletes: false,
    });

    const refreshedTargetVolume = persistedOutlineWorkspace.volumes.find((volume) => volume.id === targetVolume.id)
      ?? persistedOutlineWorkspace.volumes[0];
    if (!refreshedTargetVolume) {
      throw new Error("自动导演未能生成第 1 卷章节列表。");
    }
    if (refreshedTargetVolume.chapters.length === 0) {
      throw new Error("自动导演未能生成可同步的章节列表，当前不能进入章节执行。");
    }

    const frontTenChapters = refreshedTargetVolume.chapters
      .slice()
      .sort((left, right) => left.chapterOrder - right.chapterOrder)
      .slice(0, 10);
    const totalDetailSteps = frontTenChapters.length * DIRECTOR_CHAPTER_DETAIL_MODES.length;
    let completedDetailSteps = 0;

    for (const [chapterIndex, chapter] of frontTenChapters.entries()) {
      for (const detailMode of DIRECTOR_CHAPTER_DETAIL_MODES) {
        await this.markDirectorTaskRunning(
          taskId,
          "structured_outline",
          "chapter_detail_bundle",
          buildChapterDetailBundleLabel(chapterIndex + 1, frontTenChapters.length, detailMode),
          buildChapterDetailBundleProgress(completedDetailSteps, totalDetailSteps),
        );
        workspace = await this.volumeService.generateVolumes(novelId, {
          provider: input.provider,
          model: input.model,
          temperature: input.temperature,
          scope: "chapter_detail",
          targetVolumeId: refreshedTargetVolume.id,
          targetChapterId: chapter.id,
          detailMode,
          draftWorkspace: persistedOutlineWorkspace,
        });
        persistedOutlineWorkspace = workspace;
        completedDetailSteps += 1;
      }
    }

    await this.markDirectorTaskRunning(
      taskId,
      "structured_outline",
      "chapter_detail_bundle",
      `前 ${frontTenChapters.length} 章细化已完成，正在同步章节执行资源`,
      DIRECTOR_PROGRESS.chapterDetailDone,
    );
    persistedOutlineWorkspace = await this.volumeService.updateVolumes(novelId, persistedOutlineWorkspace);
    await this.volumeService.syncVolumeChapters(novelId, {
      volumes: persistedOutlineWorkspace.volumes,
      preserveContent: true,
      applyDeletes: false,
    });
    const persistedChapters = await this.novelContextService.listChapters(novelId);
    if (persistedChapters.length === 0) {
      throw new Error("自动导演已生成拆章结果，但章节资源没有成功同步到执行区。");
    }

    await this.novelContextService.updateNovel(novelId, {
      projectStatus: "in_progress",
      storylineStatus: "in_progress",
      outlineStatus: "in_progress",
    });

    const pausedSession = buildDirectorSessionState({
      runMode: input.runMode,
      phase: "front10_ready",
      isBackgroundRunning: false,
    });
    const chapterResumeTarget = buildNovelEditResumeTarget({
      novelId,
      taskId,
      stage: "chapter",
      volumeId: refreshedTargetVolume.id,
      chapterId: frontTenChapters[0]?.id ?? null,
    });
    await this.workflowService.recordCheckpoint(taskId, {
      stage: "chapter_execution",
      checkpointType: "front10_ready",
      checkpointSummary: `《${input.candidate.workingTitle.trim() || input.title?.trim() || "当前项目"}》已生成第 1 卷节奏板，并准备好前 ${frontTenChapters.length} 章细化。`,
      itemLabel: `前 ${frontTenChapters.length} 章已可进入章节执行`,
      volumeId: refreshedTargetVolume.id,
      chapterId: frontTenChapters[0]?.id ?? null,
      progress: DIRECTOR_PROGRESS.front10Ready,
      seedPayload: this.buildDirectorSeedPayload(input, novelId, {
        directorSession: pausedSession,
        resumeTarget: chapterResumeTarget,
      }),
    });
  }

  private async generateBatch(context: CandidateGenerationContext) {
    const requestedTemperature = context.options.temperature ?? 0.4;
    const temperature = Math.min(requestedTemperature, 0.45);
    const parsed = await runStructuredPrompt({
      asset: directorCandidatePrompt,
      promptInput: {
        idea: context.idea,
        context: context.request,
        count: context.count,
        batches: context.batches,
        presets: context.presets,
        feedback: context.feedback,
      },
      contextBlocks: buildDirectorCandidateContextBlocks({
        idea: context.idea,
        context: context.request,
        latestBatch: context.batches.at(-1),
        presets: context.presets,
        feedback: context.feedback,
      }),
      options: {
        provider: context.options.provider,
        model: context.options.model,
        temperature,
      },
    });
    const normalizedCandidates = parsed.output.candidates.map((candidate, index) => normalizeCandidate(candidate, index));
    const enrichedCandidates = await Promise.all(
      normalizedCandidates.map((candidate) => enhanceCandidateTitles(candidate, context)),
    );

    const round = (context.batches.at(-1)?.round ?? 0) + 1;
    const batch: DirectorCandidateBatch = {
      id: randomUUID(),
      round,
      roundLabel: `第 ${round} 轮`,
      idea: context.idea.trim(),
      refinementSummary: buildRefinementSummary(context.presets, context.feedback, round),
      presets: context.presets,
      candidates: enrichedCandidates,
      createdAt: new Date().toISOString(),
    };
    return { batch };
  }

  private async ensureConstraintEngine(
    novelId: string,
    plan: StoryMacroPlan,
  ): Promise<StoryMacroPlan> {
    if (plan.constraintEngine) {
      return plan;
    }

    try {
      return await this.storyMacroService.buildConstraintEngine(novelId);
    } catch {
      return plan;
    }
  }

  private async generateBookContract(
    input: DirectorConfirmRequest,
    bookSpec: BookSpec,
    storyMacroPlan: StoryMacroPlan | null,
    storyInput: string,
  ): Promise<BookContractDraft> {
    const requestedTemperature = input.temperature ?? 0.4;
    const temperature = Math.min(requestedTemperature, 0.4);
    const parsed = await runStructuredPrompt({
      asset: directorBookContractPrompt,
      promptInput: {
        idea: storyInput,
        context: input,
        candidate: input.candidate,
        storyMacroPlan,
        targetChapterCount: input.estimatedChapterCount ?? bookSpec.targetChapterCount,
      },
      contextBlocks: buildDirectorBookContractContextBlocks({
        idea: storyInput,
        context: input,
        candidate: input.candidate,
        storyMacroPlan,
        targetChapterCount: input.estimatedChapterCount ?? bookSpec.targetChapterCount,
      }),
      options: {
        provider: input.provider,
        model: input.model,
        temperature,
      },
    });
    return normalizeBookContract(parsed.output);
  }

  // Director 侧 JSON 输出解析/修复统一由 invokeStructuredLlm 完成，
  // 不再维护 extractJSONObject/JSON.parse 的重复逻辑。
}
