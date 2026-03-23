import type { BaseMessageChunk } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { AuditReport, QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import type { TaskType } from "../../llm/modelRouter";
import { getLLM } from "../../llm/factory";
import { NovelContinuationService } from "./NovelContinuationService";

export interface ChapterGraphLLMOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  taskType?: TaskType;
}

export interface ChapterGraphGenerateOptions extends ChapterGraphLLMOptions {
  previousChaptersSummary?: string[];
}

export interface ChapterGraphPipelineOptions extends ChapterGraphLLMOptions {
  autoReview?: boolean;
  autoRepair?: boolean;
  maxRetries?: number;
  qualityThreshold?: number;
}

interface ChapterRef {
  id: string;
  title: string;
  order: number;
  content?: string | null;
  expectation?: string | null;
}

type ContinuationPack = Awaited<ReturnType<NovelContinuationService["buildChapterContextPack"]>>;

interface ChapterGraphDeps {
  toText: (content: unknown) => string;
  normalizeScore: (value: Partial<QualityScore>) => QualityScore;
  ruleScore: (content: string) => QualityScore;
  isPass: (score: QualityScore) => boolean;
  buildSupportingContextText?: (novelId: string, chapter: ChapterRef) => Promise<string>;
  buildContextText: (novelId: string, chapterOrder: number) => Promise<string>;
  buildOpeningConstraintHint: (novelId: string, chapterOrder: number) => Promise<string>;
  enforceOpeningDiversity: (
    novelId: string,
    chapterOrder: number,
    chapterTitle: string,
    content: string,
    options: ChapterGraphLLMOptions,
  ) => Promise<{ content: string; rewritten: boolean; maxSimilarity: number }>;
  reviewChapterContent: (
    novelTitle: string,
    chapterTitle: string,
    content: string,
    options: ChapterGraphLLMOptions,
    novelId?: string,
    chapterId?: string,
  ) => Promise<{ score: QualityScore; issues: ReviewIssue[]; auditReports?: AuditReport[] }>;
  createQualityReport: (
    novelId: string,
    chapterId: string,
    score: QualityScore,
    issues: ReviewIssue[],
  ) => Promise<void>;
  syncAuditReports?: (
    novelId: string,
    chapterId: string,
    auditReports: AuditReport[],
  ) => Promise<void>;
  saveDraftAndArtifacts: (
    novelId: string,
    chapterId: string,
    content: string,
    generationState: "drafted" | "repaired",
  ) => Promise<void>;
  updateChapterGenerationState: (
    chapterId: string,
    generationState: "reviewed" | "approved",
  ) => Promise<void>;
  logInfo: (message: string, meta?: Record<string, unknown>) => void;
  logWarn: (message: string, meta?: Record<string, unknown>) => void;
}

export interface ChapterStreamInput {
  novelId: string;
  novelTitle: string;
  chapter: ChapterRef;
  characterLines?: string;
  contextPackage?: GenerationContextPackage;
  options: ChapterGraphGenerateOptions;
}

export interface ChapterPipelineInput {
  jobId: string;
  novelId: string;
  novelTitle: string;
  chapter: ChapterRef;
  options: ChapterGraphPipelineOptions;
  onCheckCancelled: () => Promise<void>;
  onStageChange: (stage: "generating_chapters" | "reviewing" | "repairing") => Promise<void>;
}

export interface ChapterPipelineResult {
  pass: boolean;
  score: QualityScore;
  issues: ReviewIssue[];
  auditReports?: AuditReport[];
  retryCountUsed: number;
}

const continuationService = new NovelContinuationService();

function buildCharacterLines(contextPackage?: GenerationContextPackage, fallback?: string): string {
  if (fallback?.trim()) {
    return fallback;
  }
  const roster = contextPackage?.characterRoster ?? [];
  if (roster.length === 0) {
    return "none";
  }
  return roster
    .map((character) => {
      const summary = [
        character.personality?.trim(),
        character.currentState?.trim() ? `当前状态: ${character.currentState.trim()}` : "",
        character.currentGoal?.trim() ? `当前目标: ${character.currentGoal.trim()}` : "",
      ].filter(Boolean).join(" | ");
      return `- ${character.name} (${character.role})${summary ? `: ${summary}` : ""}`;
    })
    .join("\n");
}

function buildPlanText(contextPackage?: GenerationContextPackage, fallback?: string | null): string {
  const plan = contextPackage?.plan;
  if (!plan) {
    return fallback?.trim()
      ? `\nChapter plan (must follow):\n${fallback.trim()}`
      : "";
  }
  const lines = [
    `Plan title: ${plan.title}`,
    `Objective: ${plan.objective}`,
    plan.participants.length > 0 ? `Participants: ${plan.participants.join("、")}` : "",
    plan.reveals.length > 0 ? `Key reveals: ${plan.reveals.join("；")}` : "",
    plan.riskNotes.length > 0 ? `Risk notes: ${plan.riskNotes.join("；")}` : "",
    plan.hookTarget ? `Hook target: ${plan.hookTarget}` : "",
    plan.scenes.length > 0
      ? `Scenes:\n${plan.scenes.map((scene) => (
        `${scene.sortOrder}. ${scene.title}${scene.objective ? ` | 目标:${scene.objective}` : ""}${scene.conflict ? ` | 冲突:${scene.conflict}` : ""}${scene.reveal ? ` | 揭露:${scene.reveal}` : ""}${scene.emotionBeat ? ` | 情绪:${scene.emotionBeat}` : ""}`
      )).join("\n")}`
      : "",
  ].filter(Boolean);
  return lines.length > 0 ? `\nChapter plan (must follow):\n${lines.join("\n")}` : "";
}

function buildStylePromptText(contextPackage?: GenerationContextPackage): string {
  const compiled = contextPackage?.styleContext?.compiledBlocks;
  if (!compiled) {
    return "";
  }
  return [
    "Style engine constraints:",
    compiled.style,
    compiled.character,
    compiled.antiAi,
    compiled.selfCheck,
  ].filter(Boolean).join("\n\n");
}

export class ChapterWritingGraph {
  constructor(private readonly deps: ChapterGraphDeps) {}

  private async resolveContextText(
    novelId: string,
    chapter: ChapterRef,
    contextPackage?: GenerationContextPackage,
    previousChaptersSummary?: string[],
  ): Promise<string> {
    if (contextPackage?.chapter.supportingContextText) {
      return contextPackage.chapter.supportingContextText;
    }
    if (previousChaptersSummary?.length) {
      return previousChaptersSummary.join("\n");
    }
    if (this.deps.buildSupportingContextText) {
      return this.deps.buildSupportingContextText(novelId, chapter);
    }
    return this.deps.buildContextText(novelId, chapter.order);
  }

  private async plannerAndWriterNode(
    novelId: string,
    novelTitle: string,
    chapter: ChapterRef,
    options: ChapterGraphLLMOptions,
  ): Promise<{ content: string; continuationPack: Awaited<ReturnType<NovelContinuationService["buildChapterContextPack"]>> }> {
    const llm = await getLLM(options.provider, {
      fallbackProvider: "deepseek",
      model: options.model,
      temperature: options.temperature ?? 0.8,
      taskType: options.taskType ?? "writer",
    });
    const context = await this.resolveContextText(novelId, chapter);
    const openingHint = await this.deps.buildOpeningConstraintHint(novelId, chapter.order);
    const continuationPack = await continuationService.buildChapterContextPack(novelId);
    const plan = await llm.invoke([
      new SystemMessage(
        `${continuationPack.enabled ? `${continuationPack.systemRule}\n` : ""}You are a web-novel chapter planner. Provide chapter objective, conflict, hook and opening trigger. Avoid repeating previous chapter openings.`,
      ),
      new HumanMessage(
        `Novel: ${novelTitle}
Chapter: ${chapter.title}
Context:
${context}

Opening anti-repeat constraints:
${openingHint}

${continuationPack.enabled ? continuationPack.humanBlock : ""}`,
      ),
    ]);
    const draft = await llm.invoke([
      new SystemMessage(
        `You are a web-novel writer. Output must be Simplified Chinese.
Write 2000-3000 Chinese characters.
Requirements:
1) Do not repeat completed events.
2) Do not copy long context sentences.
3) Must push new conflict and new information.
4) Opening 2-4 sentences must be structurally different from recent chapters.
${continuationPack.enabled ? `5) ${continuationPack.systemRule}` : ""}`.trim(),
      ),
      new HumanMessage(
        `Chapter plan:
${this.deps.toText(plan.content)}
Chapter title: ${chapter.title}
Chapter context:
${context}

Opening anti-repeat constraints:
${openingHint}

${continuationPack.enabled ? continuationPack.humanBlock : ""}`,
      ),
    ]);
    return {
      content: this.deps.toText(draft.content),
      continuationPack,
    };
  }

  private async continuityNode(
    novelId: string,
    chapter: ChapterRef,
    content: string,
    options: ChapterGraphLLMOptions,
    continuationPack: Awaited<ReturnType<NovelContinuationService["buildChapterContextPack"]>>,
  ): Promise<string> {
    const openingGuard = await this.deps.enforceOpeningDiversity(
      novelId,
      chapter.order,
      chapter.title,
      content,
      options,
    );
    if (openingGuard.rewritten) {
      this.deps.logInfo("Opening diversity rewrite applied", {
        chapterOrder: chapter.order,
        maxSimilarity: Number(openingGuard.maxSimilarity.toFixed(4)),
      });
    }

    const continuationGuard = await continuationService.rewriteIfTooSimilar({
      chapterTitle: chapter.title,
      content: openingGuard.content,
      continuationPack,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
    });
    if (continuationGuard.rewritten) {
      this.deps.logInfo("Continuation anti-copy rewrite applied", {
        chapterOrder: chapter.order,
        maxSimilarity: Number(continuationGuard.maxSimilarity.toFixed(4)),
      });
    }
    return continuationGuard.content;
  }

  private async reviewerNode(
    novelId: string,
    novelTitle: string,
    chapterTitle: string,
    chapterId: string | undefined,
    content: string,
    options: ChapterGraphPipelineOptions,
  ): Promise<{ score: QualityScore; issues: ReviewIssue[]; auditReports?: AuditReport[] }> {
    if (options.autoReview === false) {
      return { score: this.deps.ruleScore(content), issues: [], auditReports: [] };
    }
    return this.deps.reviewChapterContent(
      novelTitle,
      chapterTitle,
      content,
      options,
      novelId,
      chapterId,
    );
  }

  private async repairNode(
    chapterTitle: string,
    content: string,
    issues: ReviewIssue[],
    options: ChapterGraphPipelineOptions,
  ): Promise<string> {
    const llm = await getLLM(options.provider, {
      fallbackProvider: "deepseek",
      model: options.model,
      temperature: options.temperature ?? 0.8,
      taskType: options.taskType ?? "repair",
    });
    const repaired = await llm.invoke([
      new SystemMessage("你是网文修文编辑，请根据问题清单修复正文"),
      new HumanMessage(
        `章节标题${chapterTitle}
当前正文：
${content}
问题清单：
${JSON.stringify(issues, null, 2)}`,
      ),
    ]);
    return this.deps.toText(repaired.content);
  }

  async createChapterStream(input: ChapterStreamInput): Promise<{
    stream: AsyncIterable<BaseMessageChunk>;
    onDone: (fullContent: string) => Promise<{ finalContent: string } | void>;
  }> {
    const context = await this.resolveContextText(
      input.novelId,
      input.chapter,
      input.contextPackage,
      input.options.previousChaptersSummary,
    );
    const openingHint = input.contextPackage?.openingHint
      || await this.deps.buildOpeningConstraintHint(input.novelId, input.chapter.order);
    const continuationPack = (input.contextPackage?.continuation as ContinuationPack | undefined)
      ?? await continuationService.buildChapterContextPack(input.novelId);
    const chapterPlan = buildPlanText(input.contextPackage, input.chapter.expectation);
    const characterLines = buildCharacterLines(input.contextPackage, input.characterLines);
    const stylePrompt = buildStylePromptText(input.contextPackage);
    const llm = await getLLM(input.options.provider, {
      fallbackProvider: "deepseek",
      model: input.options.model,
      temperature: input.options.temperature ?? 0.8,
      taskType: input.options.taskType ?? "writer",
    });
    const stream = await llm.stream([
      new SystemMessage(
        `You are a web-novel writer. Output must be Simplified Chinese.
Write 2000-3000 Chinese characters based on character settings, chapter plan and context.
Hard requirements:
1) Advance new plot events; do not retell completed events.
2) Callback references are allowed but must be short; do not reuse long context sentences.
3) Do not add new core characters or rewrite fixed settings.
4) Chapter ending must include a new suspense/conflict/decision point.
5) The opening 2-4 sentences must differ from recent chapters in scene trigger, temporal cue and sentence pattern.
6) Avoid repetitive opening templates such as "I am X..." or "I am checking delivery updates in office...".
7) If style-engine constraints are present, they are mandatory and override generic prose habits.
${continuationPack.enabled ? `8) ${continuationPack.systemRule}` : ""}`.trim(),
      ),
      new HumanMessage(
        `Novel: ${input.novelTitle}
Core characters (must remain consistent):
${characterLines}
Chapter: ${input.chapter.order} - ${input.chapter.title}${chapterPlan}
Context:
${context}

Opening anti-repeat constraints:
${openingHint}

${stylePrompt ? `${stylePrompt}\n\n` : ""}

${continuationPack.enabled ? `${continuationPack.humanBlock}\n` : ""}

If an event is already covered in prior chapters, mention it in at most one sentence and move on to new events.`,
      ),
    ]);

    return {
      stream: stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string) => {
        const normalized = await this.continuityNode(
          input.novelId,
          input.chapter,
          fullContent,
          input.options,
          continuationPack,
        );
        await this.deps.saveDraftAndArtifacts(
          input.novelId,
          input.chapter.id,
          normalized,
          "drafted",
        );
        return { finalContent: normalized };
      },
    };
  }

  async runPipelineChapter(input: ChapterPipelineInput): Promise<ChapterPipelineResult> {
    const maxRetries = input.options.maxRetries ?? 2;
    const qualityThreshold = input.options.qualityThreshold ?? 75;
    let retries = 0;
    let content = input.chapter.content ?? "";
    let final: { score: QualityScore; issues: ReviewIssue[]; auditReports?: AuditReport[] } = {
      score: this.deps.normalizeScore({}),
      issues: [],
      auditReports: [],
    };
    let pass = false;
    const continuationPack = await continuationService.buildChapterContextPack(input.novelId);

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      await input.onCheckCancelled();
      if (!content.trim()) {
        await input.onStageChange("generating_chapters");
        const drafted = await this.plannerAndWriterNode(
          input.novelId,
          input.novelTitle,
          input.chapter,
          input.options,
        );
        content = drafted.content;
      }

      content = await this.continuityNode(
        input.novelId,
        input.chapter,
        content,
        input.options,
        continuationPack,
      );
      await this.deps.saveDraftAndArtifacts(
        input.novelId,
        input.chapter.id,
        content,
        attempt === 0 ? "drafted" : "repaired",
      );

      await input.onStageChange("reviewing");
      final = await this.reviewerNode(
        input.novelId,
        input.novelTitle,
        input.chapter.title,
        input.chapter.id,
        content,
        input.options,
      );
      await this.deps.updateChapterGenerationState(input.chapter.id, "reviewed");

      if (this.deps.isPass(final.score) && final.score.overall >= qualityThreshold) {
        pass = true;
        await this.deps.updateChapterGenerationState(input.chapter.id, "approved");
        break;
      }
      if (input.options.autoRepair === false || attempt >= maxRetries) {
        break;
      }

      await input.onStageChange("repairing");
      this.deps.logWarn("章节未达标，准备修复重试", {
        jobId: input.jobId,
        chapterOrder: input.chapter.order,
        attempt,
        score: final.score,
      });
      content = await this.repairNode(
        input.chapter.title,
        content,
        final.issues,
        input.options,
      );
      retries += 1;
    }

    await this.deps.createQualityReport(
      input.novelId,
      input.chapter.id,
      final.score,
      final.issues,
    );
    if (this.deps.syncAuditReports && (final.auditReports?.length ?? 0) > 0) {
      await this.deps.syncAuditReports(input.novelId, input.chapter.id, final.auditReports ?? []);
    }
    return {
      pass,
      score: final.score,
      issues: final.issues,
      auditReports: final.auditReports ?? [],
      retryCountUsed: retries,
    };
  }
}
