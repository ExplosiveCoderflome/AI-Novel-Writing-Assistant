import type { BaseMessageChunk } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
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

interface ChapterGraphDeps {
  toText: (content: unknown) => string;
  normalizeScore: (value: Partial<QualityScore>) => QualityScore;
  ruleScore: (content: string) => QualityScore;
  isPass: (score: QualityScore) => boolean;
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
  ) => Promise<{ score: QualityScore; issues: ReviewIssue[] }>;
  createQualityReport: (
    novelId: string,
    chapterId: string,
    score: QualityScore,
    issues: ReviewIssue[],
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
  characterLines: string;
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
  retryCountUsed: number;
}

const continuationService = new NovelContinuationService();

export class ChapterWritingGraph {
  constructor(private readonly deps: ChapterGraphDeps) {}

  private async plannerAndWriterNode(
    novelId: string,
    novelTitle: string,
    chapter: ChapterRef,
    options: ChapterGraphLLMOptions,
  ): Promise<{ content: string; continuationPack: Awaited<ReturnType<NovelContinuationService["buildChapterContextPack"]>> }> {
    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: options.temperature ?? 0.8,
      taskType: options.taskType ?? "writer",
    });
    const context = await this.deps.buildContextText(novelId, chapter.order);
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
    content: string,
    options: ChapterGraphPipelineOptions,
  ): Promise<{ score: QualityScore; issues: ReviewIssue[] }> {
    if (options.autoReview === false) {
      return { score: this.deps.ruleScore(content), issues: [] };
    }
    return this.deps.reviewChapterContent(
      novelTitle,
      chapterTitle,
      content,
      options,
      novelId,
    );
  }

  private async repairNode(
    chapterTitle: string,
    content: string,
    issues: ReviewIssue[],
    options: ChapterGraphPipelineOptions,
  ): Promise<string> {
    const llm = await getLLM(options.provider ?? "deepseek", {
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
    onDone: (fullContent: string) => Promise<void>;
  }> {
    const context = input.options.previousChaptersSummary?.join("\n")
      || (await this.deps.buildContextText(input.novelId, input.chapter.order));
    const openingHint = await this.deps.buildOpeningConstraintHint(input.novelId, input.chapter.order);
    const continuationPack = await continuationService.buildChapterContextPack(input.novelId);
    const chapterPlan = input.chapter.expectation?.trim()
      ? `\nChapter plan (must follow):\n${input.chapter.expectation}`
      : "";
    const llm = await getLLM(input.options.provider ?? "deepseek", {
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
${continuationPack.enabled ? `7) ${continuationPack.systemRule}` : ""}`.trim(),
      ),
      new HumanMessage(
        `Novel: ${input.novelTitle}
Core characters (must remain consistent):
${input.characterLines}
Chapter: ${input.chapter.order} - ${input.chapter.title}${chapterPlan}
Context:
${context}

Opening anti-repeat constraints:
${openingHint}

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
      },
    };
  }

  async runPipelineChapter(input: ChapterPipelineInput): Promise<ChapterPipelineResult> {
    const maxRetries = input.options.maxRetries ?? 2;
    const qualityThreshold = input.options.qualityThreshold ?? 75;
    let retries = 0;
    let content = input.chapter.content ?? "";
    let final = { score: this.deps.normalizeScore({}), issues: [] as ReviewIssue[] };
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
    return {
      pass,
      score: final.score,
      issues: final.issues,
      retryCountUsed: retries,
    };
  }
}
