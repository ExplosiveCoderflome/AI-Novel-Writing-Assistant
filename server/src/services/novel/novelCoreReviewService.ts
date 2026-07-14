import type { AuditReport, QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  chapterReviewPrompt,
} from "../../prompting/prompts/novel/review.prompts";
import { ragServices } from "../rag";
import { auditService } from "../audit/AuditService";
import { payoffLedgerSyncService } from "../payoff/PayoffLedgerSyncService";
import { plannerService } from "../planner/PlannerService";
import { stateService } from "../state/StateService";
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
import { chapterQualityLoopService } from "./quality/ChapterQualityLoopService";
import { chapterStatePairAfterManualQualityReview } from "./chapterLifecycleState";
import { directorAutomationLedgerEventService } from "./director/runtime/DirectorAutomationLedgerEventService";
import { ChapterRuntimeCoordinator } from "./runtime/ChapterRuntimeCoordinator";
import {
  ChapterContextAssemblyError,
  type AuditContextOperation,
  assembleChapterAuditContextPackage,
} from "./runtime/repair/chapterAuditContext";

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
  private readonly chapterRuntimeCoordinator = new ChapterRuntimeCoordinator({
    reviewChapterAfterRepair: (novelId, chapterId, options) => this.reviewChapter(novelId, chapterId, options),
    resolveAuditIssues: (novelId, issueIds) => this.resolveAuditIssues(novelId, issueIds),
  });

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

    const chapterStatePatch = chapterStatePairAfterManualQualityReview(isPass(review.score));
    await prisma.chapter.update({
      where: { id: chapterId },
      data: chapterStatePatch,
    });
    await createQualityReport(novelId, chapterId, review.score, review.issues);
    await chapterQualityLoopService.recordAssessment({
      novelId,
      chapterId,
      chapterOrder: chapter.order,
      score: review.score,
      issues: review.issues,
      source: options.content ? "repair_recheck" : "manual_review",
    }).catch((error) => {
      logPipelineError("Failed to record chapter quality loop assessment.", {
        novelId,
        chapterId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    const replanRecommendation = plannerService.buildReplanRecommendation({
      auditReports: review.auditReports ?? [],
      ledgerSummary: review.contextPackage?.ledgerSummary ?? null,
      contextPackage: review.contextPackage ?? null,
    });
    if (
      (review.auditReports?.length ?? 0) > 0
      && replanRecommendation.recommended
      && replanRecommendation.action === "stop_for_replan"
    ) {
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
    return this.chapterRuntimeCoordinator.createRepairStream(novelId, chapterId, options);
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
    const result = await plannerService.replan(novelId, input);
    if (result.run) {
      await directorAutomationLedgerEventService.recordReplanRunCreated({
        novelId,
        replanRunId: result.run.id,
        affectedChapterIds: result.affectedChapterIds,
        affectedChapterOrders: result.affectedChapterOrders,
        generatedPlanIds: result.generatedPlans.map((plan) => plan.id),
        blockingLedgerKeys: result.blockingLedgerKeys ?? [],
        triggerReason: result.triggerReason || result.reason,
      }).catch(() => null);
    }
    return result;
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
    return assembleChapterAuditContextPackage({
      assembler: this.generationContextAssembler,
      novelId,
      chapterId,
      options,
      operation,
    });
  }
}
