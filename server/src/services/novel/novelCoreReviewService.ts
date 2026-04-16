import type { AuditReport, QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import type { BaseMessageChunk } from "@langchain/core/messages";
import type { StreamDoneHelpers } from "../../llm/streaming";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt, streamTextPrompt } from "../../prompting/core/promptRunner";
import {
  chapterRepairPrompt,
  chapterReviewPrompt,
} from "../../prompting/prompts/novel/review.prompts";
import { ragServices } from "../rag";
import { auditService } from "../audit/AuditService";
import { payoffLedgerSyncService } from "../payoff/PayoffLedgerSyncService";
import { plannerService } from "../planner/PlannerService";
import { stateService } from "../state/StateService";
import { syncChapterArtifacts } from "./novelChapterArtifacts";
import {
  isPass,
  LLMGenerateOptions,
  logPipelineError,
  normalizeScore,
  RepairOptions,
  ReviewOptions,
  ruleScore,
} from "./novelCoreShared";
import { GenerationContextAssembler } from "./runtime/GenerationContextAssembler";
import {
  buildChapterRepairContextBlocks,
  withChapterRepairContext,
} from "../../prompting/prompts/novel/chapterLayeredContext";

type AuditContextOperation = "review" | "audit" | "repair";

class ChapterContextAssemblyError extends Error {
  readonly code = "chapter_context_assembly_failed";
  readonly novelId: string;
  readonly chapterId: string;
  readonly operation: AuditContextOperation;
  readonly cause: unknown;

  constructor(
    novelId: string,
    chapterId: string,
    operation: AuditContextOperation,
    cause: unknown,
  ) {
    const operationLabel = operation === "review"
      ? "章节审阅"
      : operation === "audit"
        ? "章节审计"
        : "章节修复";
    super(`章节上下文装配失败，无法继续${operationLabel}。请先检查当前项目的卷级规划、章节计划和运行时资产是否完整后重试。`);
    this.name = "ChapterContextAssemblyError";
    this.novelId = novelId;
    this.chapterId = chapterId;
    this.operation = operation;
    this.cause = cause;
  }
}

export async function createQualityReport(
  novelId: string,
  chapterId: string,
  score: QualityScore,
  issues: ReviewIssue[],
) {
  await prisma.qualityReport.create({
    data: {
      novelId,
      chapterId,
      coherence: score.coherence,
      repetition: score.repetition,
      pacing: score.pacing,
      voice: score.voice,
      engagement: score.engagement,
      overall: score.overall,
      issues: issues.length > 0 ? JSON.stringify(issues) : null,
    },
  });
}

export class NovelCoreReviewService {
  private readonly generationContextAssembler = new GenerationContextAssembler();

  async reviewChapter(novelId: string, chapterId: string, options: ReviewOptions = {}) {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      include: { novel: true },
    });
    if (!chapter) {
      throw new Error("章节不存在");
    }

    const review = await this.reviewChapterWithAudit(
      chapter.novel.title,
      chapter.title,
      options.content ?? chapter.content ?? "",
      options,
      novelId,
      chapterId,
    );

    await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        generationState: "reviewed",
        chapterStatus: isPass(review.score) ? "completed" : "needs_repair",
      },
    });
    await createQualityReport(novelId, chapterId, review.score, review.issues);
    const replanRecommendation = plannerService.buildReplanRecommendation({
      auditReports: review.auditReports ?? [],
      ledgerSummary: review.contextPackage?.ledgerSummary ?? null,
      contextPackage: review.contextPackage ?? null,
    });
    if ((review.auditReports?.length ?? 0) > 0 && replanRecommendation.recommended) {
      await plannerService.replan(novelId, {
        chapterId,
        triggerType: "audit_failure",
        reason: replanRecommendation.triggerReason || replanRecommendation.reason,
        sourceIssueIds: replanRecommendation.blockingIssueIds,
        provider: options.provider,
        model: options.model,
        temperature: options.temperature,
      }).catch(() => null);
    }

    return review;
  }

  async createRepairStream(novelId: string, chapterId: string, options: RepairOptions = {}) {
    const [novel, chapter, bible] = await Promise.all([
      prisma.novel.findUnique({ where: { id: novelId } }),
      prisma.chapter.findFirst({ where: { id: chapterId, novelId } }),
      prisma.novelBible.findUnique({ where: { novelId } }),
    ]);
    if (!novel || !chapter) {
      throw new Error("小说或章节不存在");
    }

    const fallbackReview = options.reviewIssues ? null : await this.reviewChapter(novelId, chapterId, options);
    const auditIssues = options.auditIssueIds?.length
      ? await prisma.auditIssue.findMany({
        where: { id: { in: options.auditIssueIds } },
        orderBy: { createdAt: "asc" },
      })
      : [];
    const issues = options.reviewIssues
      ?? fallbackReview?.issues
      ?? auditIssues.map((item) => ({
        severity: item.severity as ReviewIssue["severity"],
        category: item.auditType === "continuity" ? "coherence" : item.auditType === "character" ? "logic" : "pacing",
        evidence: item.evidence,
        fixSuggestion: item.fixSuggestion,
      }));

    let ragContext = "";
    try {
      ragContext = await ragServices.hybridRetrievalService.buildContextBlock(
        `章节修复 ${novel.title}\n${chapter.title}\n${chapter.content ?? ""}`,
        {
          novelId,
          ownerTypes: ["novel", "chapter", "chapter_summary", "consistency_fact", "character", "bible"],
          finalTopK: 8,
        },
      );
    } catch {
      ragContext = "";
    }

    const assembledContextPackage = await this.assembleAuditContextPackage(novelId, chapterId, options, "repair");
    const repairContextPackage = withChapterRepairContext(assembledContextPackage, issues);
    if (!repairContextPackage.chapterRepairContext) {
      const error = new Error("chapterRepairContext missing after successful context assembly");
      logPipelineError("Failed to derive repair context from assembled chapter context package.", {
        novelId,
        chapterId,
        operation: "repair",
        provider: options.provider ?? null,
        model: options.model ?? null,
        error: error.message,
      });
      throw new ChapterContextAssemblyError(novelId, chapterId, "repair", error);
    }
    const repairContextBlocks = buildChapterRepairContextBlocks(repairContextPackage.chapterRepairContext);

    const streamed = await streamTextPrompt({
      asset: chapterRepairPrompt,
      promptInput: {
        novelTitle: novel.title,
        bibleContent: bible?.rawContent ?? "暂无",
        chapterTitle: chapter.title,
        chapterContent: chapter.content ?? "",
        issuesJson: JSON.stringify(issues, null, 2),
        ragContext: ragContext || "",
      },
      contextBlocks: repairContextBlocks,
      options: {
        provider: options.provider ?? "deepseek",
        model: options.model,
        temperature: options.temperature ?? 0.5,
      },
    });

    return {
      stream: streamed.stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string, helpers: StreamDoneHelpers) => {
        const runId = `chapter-repair:${chapterId}`;
        helpers.writeFrame({
          type: "run_status",
          runId,
          status: "running",
          phase: "finalizing",
          message: "修复稿已生成，正在保存正文并重新审校。",
        });
        const completed = await streamed.complete;
        const repairedContent = completed.output.trim() || fullContent;
        await prisma.chapter.update({
          where: { id: chapterId },
          data: { content: repairedContent, generationState: "repaired" },
        });
        await syncChapterArtifacts(novelId, chapterId, repairedContent);

        const review = await this.reviewChapter(novelId, chapterId, { ...options, content: repairedContent });
        if (isPass(review.score)) {
          await prisma.chapter.update({ where: { id: chapterId }, data: { generationState: "approved" } });
          if (options.auditIssueIds?.length) {
            await auditService.resolveIssues(novelId, options.auditIssueIds).catch(() => null);
          }
        }
        helpers.writeFrame({
          type: "run_status",
          runId,
          status: "succeeded",
          phase: "completed",
          message: isPass(review.score)
            ? "章节修复已完成，本章已达到可继续推进状态。"
            : "修复稿已保存，但仍有问题待继续处理。",
        });
      },
    };
  }

  async getNovelState(novelId: string) {
    return stateService.getNovelState(novelId);
  }

  async getLatestStateSnapshot(novelId: string) {
    return stateService.getLatestSnapshot(novelId);
  }

  async getChapterStateSnapshot(novelId: string, chapterId: string) {
    return stateService.getChapterSnapshot(novelId, chapterId);
  }

  async rebuildNovelState(novelId: string, options: LLMGenerateOptions = {}) {
    return stateService.rebuildState(novelId, options);
  }

  async generateBookPlan(novelId: string, options: LLMGenerateOptions = {}) {
    return plannerService.generateBookPlan(novelId, options);
  }

  async generateArcPlan(novelId: string, arcId: string, options: LLMGenerateOptions = {}) {
    return plannerService.generateArcPlan(novelId, arcId, options);
  }

  async generateChapterPlan(novelId: string, chapterId: string, options: LLMGenerateOptions = {}) {
    return plannerService.generateChapterPlan(novelId, chapterId, options);
  }

  async getChapterPlan(novelId: string, chapterId: string) {
    return plannerService.getChapterPlan(novelId, chapterId);
  }

  async replanNovel(
    novelId: string,
    input: {
      chapterId?: string;
      triggerType?: string;
      sourceIssueIds?: string[];
      windowSize?: number;
      reason: string;
    } & LLMGenerateOptions,
  ) {
    return plannerService.replan(novelId, input);
  }

  async auditChapter(
    novelId: string,
    chapterId: string,
    scope: "full" | "continuity" | "character" | "plot" | "mode_fit",
    options: ReviewOptions = {},
  ) {
    const contextPackage = await this.assembleAuditContextPackage(novelId, chapterId, options, "audit");
    return auditService.auditChapter(novelId, chapterId, scope, {
      ...options,
      contextPackage,
    });
  }

  async listChapterAuditReports(novelId: string, chapterId: string) {
    return auditService.listChapterAuditReports(novelId, chapterId);
  }

  async resolveAuditIssues(novelId: string, issueIds: string[]) {
    return auditService.resolveIssues(novelId, issueIds);
  }

  async getQualityReport(novelId: string) {
    const reports = await prisma.qualityReport.findMany({
      where: { novelId },
      orderBy: { createdAt: "desc" },
    });
    if (reports.length === 0) {
      return { novelId, summary: normalizeScore({}), chapterReports: [] };
    }

    const latestByChapter = new Map<string, (typeof reports)[number]>();
    for (const report of reports) {
      if (report.chapterId && !latestByChapter.has(report.chapterId)) {
        latestByChapter.set(report.chapterId, report);
      }
    }
    const chapterReports = Array.from(latestByChapter.values());
    const source = chapterReports.length > 0 ? chapterReports : reports;
    const total = source.length;

    const summary = normalizeScore({
      coherence: source.reduce((sum, item) => sum + item.coherence, 0) / total,
      repetition: source.reduce((sum, item) => sum + item.repetition, 0) / total,
      pacing: source.reduce((sum, item) => sum + item.pacing, 0) / total,
      voice: source.reduce((sum, item) => sum + item.voice, 0) / total,
      engagement: source.reduce((sum, item) => sum + item.engagement, 0) / total,
      overall: source.reduce((sum, item) => sum + item.overall, 0) / total,
    });

    return { novelId, summary, chapterReports: source, totalReports: reports.length };
  }

  async getPayoffLedger(novelId: string, chapterOrder?: number) {
    return payoffLedgerSyncService.getPayoffLedger(novelId, { chapterOrder });
  }

  private async reviewChapterContent(
    novelTitle: string,
    chapterTitle: string,
    content: string,
    options: ReviewOptions = {},
    novelId?: string,
  ): Promise<{ score: QualityScore; issues: ReviewIssue[] }> {
    if (!content.trim()) {
      return {
        score: normalizeScore({}),
        issues: [{
          severity: "critical",
          category: "coherence",
          evidence: "章节内容为空",
          fixSuggestion: "先生成或补充正文，再进行审校",
        }],
      };
    }

    try {
      let ragContext = "";
      if (novelId) {
        try {
          ragContext = await ragServices.hybridRetrievalService.buildContextBlock(
            `章节审校 ${novelTitle}\n${chapterTitle}\n${content.slice(0, 1500)}`,
            {
              novelId,
              ownerTypes: ["novel", "chapter", "chapter_summary", "consistency_fact", "character", "bible"],
              finalTopK: 6,
            },
          );
        } catch {
          ragContext = "";
        }
      }

      const result = await runStructuredPrompt({
        asset: chapterReviewPrompt,
        promptInput: {
          novelTitle,
          chapterTitle,
          content,
          ragContext: ragContext || "",
        },
        options: {
          provider: options.provider,
          model: options.model,
          temperature: options.temperature ?? 0.1,
        },
      });
      const parsed = result.output;

      return {
        score: normalizeScore(parsed.score ?? {}),
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      };
    } catch {
      return { score: ruleScore(content), issues: [] };
    }
  }

  private async reviewChapterWithAudit(
    novelTitle: string,
    chapterTitle: string,
    content: string,
    options: ReviewOptions = {},
    novelId?: string,
    chapterId?: string,
  ): Promise<{
    score: QualityScore;
    issues: ReviewIssue[];
    auditReports?: AuditReport[];
    contextPackage?: GenerationContextPackage;
  }> {
    if (!content.trim()) {
      return {
        score: normalizeScore({}),
        issues: [{
          severity: "critical",
          category: "coherence",
          evidence: "章节内容为空",
          fixSuggestion: "先生成或补全正文，再进行审校",
        }],
        auditReports: [],
      };
    }

    if (novelId && chapterId) {
      const contextPackage = await this.assembleAuditContextPackage(novelId, chapterId, options, "review");
      const auditResult = await auditService.auditChapter(novelId, chapterId, "full", {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature,
        content,
        contextPackage,
      });
      return {
        ...auditResult,
        contextPackage,
      };
    }

    return this.reviewChapterContent(novelTitle, chapterTitle, content, options, novelId);
  }

  private async assembleAuditContextPackage(
    novelId: string,
    chapterId: string,
    options: ReviewOptions,
    operation: AuditContextOperation,
  ): Promise<GenerationContextPackage> {
    try {
      const assembled = await this.generationContextAssembler.assemble(novelId, chapterId, {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature,
      });
      return assembled.contextPackage;
    } catch (error) {
      logPipelineError("Failed to assemble chapter context package.", {
        novelId,
        chapterId,
        operation,
        provider: options.provider ?? null,
        model: options.model ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new ChapterContextAssemblyError(novelId, chapterId, operation, error);
    }
  }
}
