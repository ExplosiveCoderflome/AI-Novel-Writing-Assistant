import { randomUUID } from "node:crypto";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
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
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import { getLLM } from "../../../llm/factory";
import { NovelContextService } from "../NovelContextService";
import { StoryMacroPlanService } from "../storyMacro/StoryMacroPlanService";
import { extractJSONObject, toText } from "../novelP0Utils";
import {
  type DirectorCandidateResponse,
  directorCandidateResponseSchema,
  type DirectorPlanBlueprintParsed,
  directorPlanBlueprintSchema,
} from "./novelDirectorSchemas";
import {
  buildDirectorBlueprintPrompt,
  buildDirectorCandidatePrompt,
  buildDirectorRecoveryPrompt,
} from "./novelDirectorPrompts";
import { persistDirectorBlueprint, toDirectorPlanDigest } from "./novelDirectorPersistence";

type LLMOptions = Pick<DirectorCandidatesRequest, "provider" | "model" | "temperature">;
type RecoveryMode = "regenerate";

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

  async generateCandidates(input: DirectorCandidatesRequest) {
    return this.generateBatch({
      idea: input.idea,
      count: 2,
      batches: [],
      presets: [],
      request: input,
      options: input,
    });
  }

  async refineCandidates(input: DirectorRefinementRequest) {
    return this.generateBatch({
      idea: input.idea,
      count: 2,
      batches: input.previousBatches,
      presets: input.presets ?? [],
      feedback: input.feedback,
      request: input,
      options: input,
    });
  }

  async confirmCandidate(input: DirectorConfirmRequest): Promise<DirectorConfirmApiResponse> {
    const title = input.title?.trim() || input.candidate.workingTitle.trim();
    const description = input.description?.trim() || input.candidate.logline.trim();
    const bookSpec = this.toBookSpec(
      input.candidate,
      input.idea,
      input.estimatedChapterCount,
    );

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

    const storyInput = this.buildStoryInput(input, bookSpec);
    const storyMacroPlan = await this.storyMacroService.decompose(createdNovel.id, storyInput, input);
    const hydratedStoryMacroPlan = await this.ensureConstraintEngine(createdNovel.id, storyMacroPlan);
    const blueprint = await this.generateBlueprint(input, bookSpec, hydratedStoryMacroPlan, storyInput);
    const persisted = await persistDirectorBlueprint(createdNovel.id, blueprint);

    const novel = {
      ...createdNovel,
      outline: persisted.outline,
      storylineStatus: "in_progress" as const,
      outlineStatus: "in_progress" as const,
      projectStatus: "in_progress" as const,
      updatedAt: new Date().toISOString(),
    } as unknown as DirectorConfirmApiResponse["novel"];

    const seededPlanDigests = {
      book: persisted.book ? toDirectorPlanDigest(persisted.book) : null,
      arcs: persisted.arcs.map((plan) => toDirectorPlanDigest(plan)),
      chapters: persisted.chapters.map((plan) => toDirectorPlanDigest(plan)),
    };

    return {
      novel,
      storyMacroPlan: hydratedStoryMacroPlan,
      bookSpec,
      batch: {
        id: input.batchId,
        round: input.round,
      },
      createdChapterCount: persisted.chapters.length,
      createdArcCount: persisted.arcs.length,
      plans: seededPlanDigests,
      seededPlans: seededPlanDigests,
    };
  }

  private async generateBatch(context: CandidateGenerationContext) {
    const prompt = buildDirectorCandidatePrompt({
      idea: context.idea,
      context: context.request,
      count: context.count,
      batches: context.batches,
      presets: context.presets,
      feedback: context.feedback,
    });
    const parsed = await this.invokeStructuredJson(
      prompt.system,
      prompt.user,
      context.options,
      directorCandidateResponseSchema,
      "director candidates",
      "regenerate",
    );

    const round = (context.batches.at(-1)?.round ?? 0) + 1;
    const batch: DirectorCandidateBatch = {
      id: randomUUID(),
      round,
      roundLabel: `第 ${round} 轮`,
      idea: context.idea.trim(),
      refinementSummary: this.buildRefinementSummary(context.presets, context.feedback, round),
      presets: context.presets,
      candidates: parsed.candidates.map((candidate, index) => this.normalizeCandidate(candidate, index)),
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

  private async generateBlueprint(
    input: DirectorConfirmRequest,
    bookSpec: BookSpec,
    storyMacroPlan: StoryMacroPlan,
    storyInput: string,
  ): Promise<DirectorPlanBlueprint> {
    const prompt = buildDirectorBlueprintPrompt({
      idea: storyInput,
      context: input,
      candidate: input.candidate,
      storyMacroPlan,
      targetChapterCount: input.estimatedChapterCount ?? bookSpec.targetChapterCount,
    });
    const parsed = await this.invokeStructuredJson(
      prompt.system,
      prompt.user,
      input,
      directorPlanBlueprintSchema,
      "director blueprint",
      "regenerate",
    );
    return this.normalizeBlueprint(parsed);
  }

  private normalizeBlueprint(parsed: DirectorPlanBlueprintParsed): DirectorPlanBlueprint {
    return {
      bookPlan: {
        title: parsed.bookPlan.title.trim(),
        objective: parsed.bookPlan.objective.trim(),
        hookTarget: parsed.bookPlan.hookTarget?.trim() || undefined,
        participants: parsed.bookPlan.participants.map((item) => item.trim()).filter(Boolean),
        reveals: parsed.bookPlan.reveals.map((item) => item.trim()).filter(Boolean),
        riskNotes: parsed.bookPlan.riskNotes.map((item) => item.trim()).filter(Boolean),
      },
      arcs: parsed.arcs.map((arc) => ({
        title: arc.title.trim(),
        objective: arc.objective.trim(),
        summary: arc.summary.trim(),
        phaseLabel: arc.phaseLabel.trim(),
        hookTarget: arc.hookTarget?.trim() || undefined,
        participants: arc.participants.map((item) => item.trim()).filter(Boolean),
        reveals: arc.reveals.map((item) => item.trim()).filter(Boolean),
        riskNotes: arc.riskNotes.map((item) => item.trim()).filter(Boolean),
        chapters: arc.chapters.map((chapter) => ({
          title: chapter.title.trim(),
          objective: chapter.objective.trim(),
          expectation: chapter.expectation.trim(),
          planRole: chapter.planRole,
          hookTarget: chapter.hookTarget?.trim() || undefined,
          participants: chapter.participants.map((item) => item.trim()).filter(Boolean),
          reveals: chapter.reveals.map((item) => item.trim()).filter(Boolean),
          riskNotes: chapter.riskNotes.map((item) => item.trim()).filter(Boolean),
          scenes: chapter.scenes.map((scene) => ({
            title: scene.title.trim(),
            objective: scene.objective.trim(),
            conflict: scene.conflict?.trim() || undefined,
            reveal: scene.reveal?.trim() || undefined,
            emotionBeat: scene.emotionBeat?.trim() || undefined,
          })),
        })),
      })),
    };
  }

  private async invokeStructuredJson<T>(
    systemPrompt: string,
    userPrompt: string,
    options: LLMOptions,
    schema: { parse: (value: unknown) => T },
    label: string,
    recoveryMode: RecoveryMode,
  ): Promise<T> {
    const llm = await getLLM(options.provider, {
      fallbackProvider: "deepseek",
      model: options.model,
      temperature: this.getInvocationTemperature(label, options.temperature),
      taskType: "planner",
    });
    const result = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);
    const rawContent = toText(result.content);
    try {
      return schema.parse(JSON.parse(extractJSONObject(rawContent)));
    } catch (error) {
      return this.recoverStructuredJson(
        rawContent,
        systemPrompt,
        userPrompt,
        options,
        schema,
        label,
        recoveryMode,
        error,
      );
    }
  }

  private async recoverStructuredJson<T>(
    rawContent: string,
    systemPrompt: string,
    userPrompt: string,
    options: LLMOptions,
    schema: { parse: (value: unknown) => T },
    label: string,
    _recoveryMode: RecoveryMode,
    error: unknown,
  ): Promise<T> {
    const llm = await getLLM(options.provider, {
      fallbackProvider: "deepseek",
      model: options.model,
      temperature: 0.15,
      taskType: "planner",
    });
    const prompt = buildDirectorRecoveryPrompt({
      label,
      schemaHint: this.getSchemaHint(label),
      reason: error instanceof Error ? error.message : String(error),
      systemPrompt,
      userPrompt,
      rawContent,
    });
    const result = await llm.invoke([
      new SystemMessage(prompt.system),
      new HumanMessage(prompt.user),
    ]);
    return schema.parse(JSON.parse(extractJSONObject(toText(result.content))));
  }

  private getSchemaHint(label: string): string {
    if (label === "director candidates") {
      return "{\"candidates\":[{\"workingTitle\":\"string\",\"logline\":\"string\",\"positioning\":\"string\",\"sellingPoint\":\"string\",\"coreConflict\":\"string\",\"protagonistPath\":\"string\",\"endingDirection\":\"string\",\"hookStrategy\":\"string\",\"progressionLoop\":\"string\",\"whyItFits\":\"string\",\"toneKeywords\":[\"string\",\"string\"],\"targetChapterCount\":24}]}";
    }

    if (label === "director blueprint") {
      return "{\"bookPlan\":{\"title\":\"string\",\"objective\":\"string\",\"hookTarget\":\"string\",\"participants\":[],\"reveals\":[],\"riskNotes\":[]},\"arcs\":[{\"title\":\"string\",\"objective\":\"string\",\"summary\":\"string\",\"phaseLabel\":\"string\",\"hookTarget\":\"string\",\"participants\":[],\"reveals\":[],\"riskNotes\":[],\"chapters\":[{\"title\":\"string\",\"objective\":\"string\",\"expectation\":\"string\",\"planRole\":\"setup|progress|pressure|turn|payoff|cooldown\",\"hookTarget\":\"string\",\"participants\":[],\"reveals\":[],\"riskNotes\":[],\"scenes\":[{\"title\":\"string\",\"objective\":\"string\",\"conflict\":\"string\",\"reveal\":\"string\",\"emotionBeat\":\"string\"}]}]}]}";
    }

    return "{}";
  }

  private getInvocationTemperature(label: string, temperature: number | undefined): number {
    const requested = temperature ?? 0.4;
    if (label === "director candidates") {
      return Math.min(requested, 0.45);
    }
    if (label === "director blueprint") {
      return Math.min(requested, 0.4);
    }
    return requested;
  }
}
