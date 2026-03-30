import { randomUUID } from "node:crypto";
import type {
  BookSpec,
  DirectorCandidate,
  DirectorCandidateBatch,
  DirectorCandidatesRequest,
  DirectorConfirmApiResponse,
  DirectorConfirmRequest,
  DirectorCorrectionPreset,
  DirectorPlanBlueprint,
  DirectorProjectContextInput,
  DirectorRefinementRequest,
} from "@ai-novel/shared/types/novelDirector";
import { DIRECTOR_CORRECTION_PRESETS } from "@ai-novel/shared/types/novelDirector";
import type { BookContractDraft } from "@ai-novel/shared/types/novelWorkflow";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import type { TitleFactorySuggestion } from "@ai-novel/shared/types/title";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  buildDirectorBookContractContextBlocks,
  buildDirectorCandidateContextBlocks,
  directorBookContractPrompt,
  directorCandidatePrompt,
} from "../../../prompting/prompts/novel/directorPlanning.prompts";
import { BookContractService } from "../BookContractService";
import { NovelContextService } from "../NovelContextService";
import { StoryMacroPlanService } from "../storyMacro/StoryMacroPlanService";
import { titleGenerationService } from "../../title/TitleGenerationService";
import { isNearDuplicateTitle } from "../../title/titleGeneration.shared";
import { NovelVolumeService } from "../volume/NovelVolumeService";
import { NovelWorkflowService } from "../workflow/NovelWorkflowService";
import {
  type DirectorCandidateResponse,
  type DirectorBookContractParsed,
} from "./novelDirectorSchemas";

type LLMOptions = Pick<DirectorCandidatesRequest, "provider" | "model" | "temperature">;

interface CandidateGenerationContext {
  idea: string;
  count: number;
  batches: DirectorCandidateBatch[];
  presets: DirectorCorrectionPreset[];
  feedback?: string;
  request: DirectorProjectContextInput;
  options: LLMOptions;
}

export class NovelDirectorService {
  private readonly novelContextService = new NovelContextService();
  private readonly storyMacroService = new StoryMacroPlanService();
  private readonly bookContractService = new BookContractService();
  private readonly volumeService = new NovelVolumeService();
  private readonly workflowService = new NovelWorkflowService();

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
      seedPayload: this.buildWorkflowSeedPayload(input, {
        batches: [batch.batch],
      }),
    });
    await this.workflowService.recordCandidateSelectionRequired(workflowTask.id, {
      summary: `${batch.batch.roundLabel} 已生成 ${batch.batch.candidates.length} 套书级方向。`,
      seedPayload: this.buildWorkflowSeedPayload(input, {
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
      seedPayload: this.buildWorkflowSeedPayload(input, {
        batches: [...input.previousBatches, batch.batch],
      }),
    });
    await this.workflowService.recordCandidateSelectionRequired(workflowTask.id, {
      summary: `${batch.batch.roundLabel} 已根据修正意见生成 ${batch.batch.candidates.length} 套新方向。`,
      seedPayload: this.buildWorkflowSeedPayload(input, {
        batches: [...input.previousBatches, batch.batch],
      }),
    });
    return {
      ...batch,
      workflowTaskId: workflowTask.id,
    };
  }

  async confirmCandidate(input: DirectorConfirmRequest): Promise<DirectorConfirmApiResponse> {
    const title = input.candidate.workingTitle.trim() || input.title?.trim() || "未命名项目";
    const description = input.description?.trim() || input.candidate.logline.trim();
    const bookSpec = this.toBookSpec(
      input.candidate,
      input.idea,
      input.estimatedChapterCount,
    );
    const workflowTask = input.workflowTaskId?.trim()
      ? await this.workflowService.bootstrapTask({
        workflowTaskId: input.workflowTaskId,
        lane: "auto_director",
        title,
        seedPayload: this.buildWorkflowSeedPayload(input),
      })
      : null;
    let createdNovelId: string | null = null;

    if (workflowTask) {
      await this.workflowService.markTaskRunning(workflowTask.id, {
        stage: "auto_director",
        itemLabel: "正在创建小说项目",
      });
    }

    try {
      const createdNovel = await this.novelContextService.createNovel({
        title,
        description,
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
      createdNovelId = createdNovel.id;

      if (workflowTask) {
        await this.workflowService.attachNovelToTask(workflowTask.id, createdNovel.id, "project_setup");
        await this.workflowService.markTaskRunning(workflowTask.id, {
          stage: "story_macro",
          itemLabel: "正在生成 Book Contract 与故事宏观规划",
        });
      }

      const storyInput = this.buildStoryInput(input, bookSpec);
      const storyMacroPlan = await this.storyMacroService.decompose(createdNovel.id, storyInput, input);
      const hydratedStoryMacroPlan = await this.ensureConstraintEngine(createdNovel.id, storyMacroPlan);
      const bookContractDraft = await this.generateBookContract(input, bookSpec, hydratedStoryMacroPlan, storyInput);
      const bookContract = await this.bookContractService.upsert(createdNovel.id, bookContractDraft);

      if (workflowTask) {
        await this.workflowService.recordCheckpoint(workflowTask.id, {
          stage: "story_macro",
          checkpointType: "book_contract_ready",
          checkpointSummary: "Book Contract、故事引擎与约束引擎已生成。",
          itemLabel: "Book Contract 已生成",
          progress: 0.3,
          seedPayload: this.buildWorkflowSeedPayload(input, {
            novelId: createdNovel.id,
          }),
        });
        await this.workflowService.markTaskRunning(workflowTask.id, {
          stage: "volume_strategy",
          itemLabel: "正在生成卷战略与卷骨架",
        });
      }

      let workspace = await this.volumeService.generateVolumes(createdNovel.id, {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature,
        scope: "strategy",
        estimatedChapterCount: input.estimatedChapterCount ?? bookSpec.targetChapterCount,
      });
      workspace = await this.volumeService.generateVolumes(createdNovel.id, {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature,
        scope: "skeleton",
        estimatedChapterCount: input.estimatedChapterCount ?? bookSpec.targetChapterCount,
        draftWorkspace: workspace,
      });
      const persistedStrategyWorkspace = await this.volumeService.updateVolumes(createdNovel.id, workspace);

      if (workflowTask) {
        await this.workflowService.recordCheckpoint(workflowTask.id, {
          stage: "volume_strategy",
          checkpointType: "volume_strategy_ready",
          checkpointSummary: `卷战略与卷骨架已生成，共 ${persistedStrategyWorkspace.volumes.length} 卷。`,
          itemLabel: "卷战略 / 卷骨架已准备完成",
          progress: 0.56,
          seedPayload: this.buildWorkflowSeedPayload(input, {
            novelId: createdNovel.id,
          }),
        });
        await this.workflowService.markTaskRunning(workflowTask.id, {
          stage: "structured_outline",
          itemLabel: "正在生成第 1 卷节奏板与前 10 章细化",
        });
      }

      const targetVolume = persistedStrategyWorkspace.volumes[0];
      if (!targetVolume) {
        throw new Error("自动导演未能生成可用卷骨架。");
      }

      workspace = await this.volumeService.generateVolumes(createdNovel.id, {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature,
        scope: "beat_sheet",
        targetVolumeId: targetVolume.id,
        draftWorkspace: persistedStrategyWorkspace,
      });
      workspace = await this.volumeService.generateVolumes(createdNovel.id, {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature,
        scope: "chapter_list",
        targetVolumeId: targetVolume.id,
        draftWorkspace: workspace,
      });
      let persistedOutlineWorkspace = await this.volumeService.updateVolumes(createdNovel.id, workspace);
      await this.volumeService.syncVolumeChapters(createdNovel.id, {
        volumes: persistedOutlineWorkspace.volumes,
        preserveContent: true,
        applyDeletes: false,
      });

      const refreshedTargetVolume = persistedOutlineWorkspace.volumes.find((volume) => volume.id === targetVolume.id)
        ?? persistedOutlineWorkspace.volumes[0];
      if (!refreshedTargetVolume) {
        throw new Error("自动导演未能生成第 1 卷章节列表。");
      }

      const frontTenChapters = refreshedTargetVolume.chapters
        .slice()
        .sort((left, right) => left.chapterOrder - right.chapterOrder)
        .slice(0, 10);

      for (const chapter of frontTenChapters) {
        for (const detailMode of ["purpose", "boundary", "task_sheet"] as const) {
          workspace = await this.volumeService.generateVolumes(createdNovel.id, {
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
        }
      }

      persistedOutlineWorkspace = await this.volumeService.updateVolumes(createdNovel.id, persistedOutlineWorkspace);
      await this.volumeService.syncVolumeChapters(createdNovel.id, {
        volumes: persistedOutlineWorkspace.volumes,
        preserveContent: true,
        applyDeletes: false,
      });

      await this.novelContextService.updateNovel(createdNovel.id, {
        projectStatus: "in_progress",
        storylineStatus: "in_progress",
        outlineStatus: "in_progress",
      });

      if (workflowTask) {
        await this.workflowService.recordCheckpoint(workflowTask.id, {
          stage: "chapter_execution",
          checkpointType: "front10_ready",
          checkpointSummary: `《${title}》已生成第 1 卷节奏板，并准备好前 ${frontTenChapters.length} 章细化。`,
          itemLabel: "前 10 章已可进入章节执行",
          volumeId: refreshedTargetVolume.id,
          chapterId: frontTenChapters[0]?.id ?? null,
          progress: 0.72,
          seedPayload: this.buildWorkflowSeedPayload(input, {
            novelId: createdNovel.id,
          }),
        });
      }

      const novel = await this.novelContextService.getNovelById(createdNovel.id) as unknown as DirectorConfirmApiResponse["novel"];
      const seededPlanDigests = {
        book: null,
        arcs: [],
        chapters: [],
      };

      return {
        novel,
        storyMacroPlan: hydratedStoryMacroPlan,
        bookContract,
        bookSpec,
        batch: {
          id: input.batchId,
          round: input.round,
        },
        createdChapterCount: frontTenChapters.length,
        createdArcCount: persistedStrategyWorkspace.volumes.length,
        workflowTaskId: workflowTask?.id,
        plans: seededPlanDigests,
        seededPlans: seededPlanDigests,
      };
    } catch (error) {
      if (workflowTask) {
        const message = error instanceof Error ? error.message : "自动导演确认链执行失败。";
        await this.workflowService.markTaskFailed(workflowTask.id, message, {
          stage: createdNovelId ? "chapter_execution" : "auto_director",
          itemLabel: "自动导演确认链执行失败",
        });
      }
      throw error;
    }
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
    const normalizedCandidates = parsed.output.candidates.map((candidate, index) => this.normalizeCandidate(candidate, index));
    const enrichedCandidates = await Promise.all(
      normalizedCandidates.map((candidate) => this.enhanceCandidateTitles(candidate, context)),
    );

    const round = (context.batches.at(-1)?.round ?? 0) + 1;
    const batch: DirectorCandidateBatch = {
      id: randomUUID(),
      round,
      roundLabel: `第 ${round} 轮`,
      idea: context.idea.trim(),
      refinementSummary: this.buildRefinementSummary(context.presets, context.feedback, round),
      presets: context.presets,
      candidates: enrichedCandidates,
      createdAt: new Date().toISOString(),
    };
    return { batch };
  }

  private normalizeCandidate(
    candidate: DirectorCandidateResponse["candidates"][number],
    index: number,
  ): DirectorCandidate {
    return {
      id: randomUUID(),
      workingTitle: candidate.workingTitle.trim() || `方案 ${index + 1}`,
      titleOptions: [],
      logline: candidate.logline.trim(),
      positioning: candidate.positioning.trim(),
      sellingPoint: candidate.sellingPoint.trim(),
      coreConflict: candidate.coreConflict.trim(),
      protagonistPath: candidate.protagonistPath.trim(),
      endingDirection: candidate.endingDirection.trim(),
      hookStrategy: candidate.hookStrategy.trim(),
      progressionLoop: candidate.progressionLoop.trim(),
      whyItFits: candidate.whyItFits.trim(),
      toneKeywords: Array.from(
        new Set(candidate.toneKeywords.map((item) => item.trim()).filter(Boolean)),
      ).slice(0, 4),
      targetChapterCount: Math.max(12, Math.min(120, Math.round(candidate.targetChapterCount))),
    };
  }

  private async enhanceCandidateTitles(
    candidate: DirectorCandidate,
    context: CandidateGenerationContext,
  ): Promise<DirectorCandidate> {
    const fallbackOptions = [this.buildFallbackTitleOption(candidate)];

    try {
      const response = await titleGenerationService.generateTitleIdeas({
        mode: "brief",
        brief: this.buildCandidateTitleBrief(candidate, context),
        genreId: context.request.genreId ?? null,
        count: 4,
        provider: context.options.provider,
        model: context.options.model,
      });
      const mergedOptions = this.mergeTitleOptions(response.titles, candidate);
      const primaryTitle = mergedOptions[0]?.title?.trim();
      return {
        ...candidate,
        workingTitle: primaryTitle || candidate.workingTitle,
        titleOptions: mergedOptions,
      };
    } catch {
      return {
        ...candidate,
        titleOptions: fallbackOptions,
      };
    }
  }

  private buildCandidateTitleBrief(
    candidate: DirectorCandidate,
    context: CandidateGenerationContext,
  ): string {
    const lines = [
      `故事灵感：${context.idea.trim()}`,
      `方案定位：${candidate.positioning}`,
      `核心卖点：${candidate.sellingPoint}`,
      `主线冲突：${candidate.coreConflict}`,
      `主角路径：${candidate.protagonistPath}`,
      `开篇钩子：${candidate.hookStrategy}`,
      `推进循环：${candidate.progressionLoop}`,
      `结局方向：${candidate.endingDirection}`,
      candidate.toneKeywords.length > 0 ? `气质关键词：${candidate.toneKeywords.join("、")}` : "",
      context.request.title?.trim() ? `用户当前草拟标题：${context.request.title.trim()}` : "",
      `当前方案原始命名：${candidate.workingTitle}`,
      "请生成更适合中文网文封面展示和点击测试的书名，突出卖点、反差、异常规则、主角优势或追更钩子。",
      "不要写成策划案标题、世界观概念短语、流水线土味套壳名，也不要为了文艺感牺牲点击感。",
    ].filter(Boolean);
    return lines.join("\n");
  }

  private mergeTitleOptions(
    generatedTitles: TitleFactorySuggestion[],
    candidate: DirectorCandidate,
  ): TitleFactorySuggestion[] {
    const merged: TitleFactorySuggestion[] = [];
    for (const option of generatedTitles) {
      if (!merged.some((existing) => isNearDuplicateTitle(existing.title, option.title))) {
        merged.push(option);
      }
    }

    const originalOption = this.buildFallbackTitleOption(candidate);
    if (!merged.some((existing) => isNearDuplicateTitle(existing.title, originalOption.title))) {
      merged.push(originalOption);
    }

    return merged.slice(0, 4);
  }

  private buildFallbackTitleOption(candidate: DirectorCandidate): TitleFactorySuggestion {
    return {
      title: candidate.workingTitle,
      clickRate: 60,
      style: "high_concept",
      angle: "原始方案书名",
      reason: "沿用导演候选原始命名。",
    };
  }

  private toBookSpec(
    candidate: DirectorCandidate,
    idea: string,
    overrideTargetChapterCount?: number,
  ): BookSpec {
    return {
      storyInput: idea.trim(),
      positioning: candidate.positioning.trim(),
      sellingPoint: candidate.sellingPoint.trim(),
      coreConflict: candidate.coreConflict.trim(),
      protagonistPath: candidate.protagonistPath.trim(),
      endingDirection: candidate.endingDirection.trim(),
      hookStrategy: candidate.hookStrategy.trim(),
      progressionLoop: candidate.progressionLoop.trim(),
      targetChapterCount: Math.max(
        12,
        Math.min(120, Math.round(overrideTargetChapterCount ?? candidate.targetChapterCount)),
      ),
    };
  }

  private buildRefinementSummary(
    presets: DirectorCorrectionPreset[],
    feedback: string | undefined,
    round: number,
  ): string | null {
    if (round === 1 && presets.length === 0 && !feedback?.trim()) {
      return null;
    }

    const presetSummary = presets.map((preset) => (
      DIRECTOR_CORRECTION_PRESETS.find((item) => item.value === preset)?.label ?? preset
    ));
    const fragments = [
      presetSummary.length > 0 ? `预设修正：${presetSummary.join("、")}` : "",
      feedback?.trim() ? `补充说明：${feedback.trim()}` : "",
    ].filter(Boolean);
    return fragments.join("；") || "按上一轮意见重新生成";
  }

  private buildStoryInput(input: DirectorConfirmRequest, bookSpec: BookSpec): string {
    const lines = [
      input.idea.trim(),
      input.description?.trim() ? `补充概述：${input.description.trim()}` : "",
      `确认方案：${input.candidate.workingTitle}`,
      `作品定位：${bookSpec.positioning}`,
      `核心卖点：${bookSpec.sellingPoint}`,
      `主线冲突：${bookSpec.coreConflict}`,
      `主角路径：${bookSpec.protagonistPath}`,
      `主钩子：${bookSpec.hookStrategy}`,
      `推进循环：${bookSpec.progressionLoop}`,
      `结局方向：${bookSpec.endingDirection}`,
    ].filter(Boolean);
    return lines.join("\n");
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
    return this.normalizeBookContract(parsed.output);
  }

  private normalizeBookContract(parsed: DirectorBookContractParsed): BookContractDraft {
    return {
      readingPromise: parsed.readingPromise.trim(),
      protagonistFantasy: parsed.protagonistFantasy.trim(),
      coreSellingPoint: parsed.coreSellingPoint.trim(),
      chapter3Payoff: parsed.chapter3Payoff.trim(),
      chapter10Payoff: parsed.chapter10Payoff.trim(),
      chapter30Payoff: parsed.chapter30Payoff.trim(),
      escalationLadder: parsed.escalationLadder.trim(),
      relationshipMainline: parsed.relationshipMainline.trim(),
      absoluteRedLines: Array.from(new Set(parsed.absoluteRedLines.map((item) => item.trim()).filter(Boolean))).slice(0, 6),
    };
  }

  private buildWorkflowSeedPayload(
    input: DirectorProjectContextInput & { idea: string },
    extra?: Record<string, unknown>,
  ): Record<string, unknown> {
    const basicForm = {
      title: input.title?.trim() || "",
      description: input.description?.trim() || "",
      genreId: input.genreId ?? "",
      worldId: input.worldId ?? "",
      writingMode: input.writingMode ?? "original",
      projectMode: input.projectMode ?? "co_pilot",
      narrativePov: input.narrativePov ?? "third_person",
      pacePreference: input.pacePreference ?? "balanced",
      styleTone: input.styleTone?.trim() || "",
      emotionIntensity: input.emotionIntensity ?? "medium",
      aiFreedom: input.aiFreedom ?? "medium",
      defaultChapterLength: input.defaultChapterLength ?? 2800,
      estimatedChapterCount: input.estimatedChapterCount ?? null,
      projectStatus: input.projectStatus ?? "not_started",
      storylineStatus: input.storylineStatus ?? "not_started",
      outlineStatus: input.outlineStatus ?? "not_started",
      resourceReadyScore: input.resourceReadyScore ?? 0,
      sourceNovelId: input.sourceNovelId ?? "",
      sourceKnowledgeDocumentId: input.sourceKnowledgeDocumentId ?? "",
      continuationBookAnalysisId: input.continuationBookAnalysisId ?? "",
      continuationBookAnalysisSections: input.continuationBookAnalysisSections ?? [],
    };
    return {
      title: basicForm.title || null,
      description: basicForm.description || null,
      genreId: basicForm.genreId || null,
      worldId: basicForm.worldId || null,
      writingMode: basicForm.writingMode,
      projectMode: basicForm.projectMode,
      narrativePov: basicForm.narrativePov,
      pacePreference: basicForm.pacePreference,
      styleTone: basicForm.styleTone || null,
      emotionIntensity: basicForm.emotionIntensity,
      aiFreedom: basicForm.aiFreedom,
      estimatedChapterCount: basicForm.estimatedChapterCount,
      idea: input.idea.trim(),
      basicForm,
      ...extra,
    };
  }

  // Director 侧 JSON 输出解析/修复统一由 invokeStructuredLlm 完成，
  // 不再维护 extractJSONObject/JSON.parse 的重复逻辑。
}
