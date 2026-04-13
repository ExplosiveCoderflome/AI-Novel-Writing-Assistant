import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { AuditReport, AuditType, QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import type { ChapterRuntimePackage, GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import { prisma } from "../../db/prisma";
import { payoffLedgerSyncService } from "../payoff/PayoffLedgerSyncService";
import { buildStoryModePromptBlock, normalizeStoryModeOutput } from "../storyMode/storyModeProfile";
import { openConflictService } from "../state/OpenConflictService";
import {
  normalizeAuditType,
  normalizeScore,
  normalizeSeverity,
  parseLegacyReviewOutput,
  ruleScore,
} from "../novel/novelP0Utils";
import { ragServices } from "../rag";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { auditChapterPrompt } from "../../prompting/prompts/audit/audit.prompts";
import { buildChapterReviewContextBlocks } from "../../prompting/prompts/novel/chapterLayeredContext";

interface AuditOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  content?: string;
  contextPackage?: GenerationContextPackage;
  lengthControl?: ChapterRuntimePackage["lengthControl"];
}

interface AuditIssueOutput {
  severity?: string;
  code?: string;
  description?: string;
  evidence?: string;
  fixSuggestion?: string;
}

interface AuditReportOutput {
  auditType?: string;
  overallScore?: number;
  summary?: string;
  issues?: AuditIssueOutput[];
}

interface FullAuditOutput {
  score?: Partial<QualityScore>;
  issues?: ReviewIssue[];
  auditReports?: AuditReportOutput[];
}

const LEGACY_CATEGORY_MAP: Record<AuditType, ReviewIssue["category"]> = {
  continuity: "coherence",
  character: "logic",
  plot: "pacing",
  mode_fit: "coherence",
};

function countChapterCharacters(content: string): number {
  return content.replace(/\s+/g, "").trim().length;
}

export class AuditService {
  async auditChapter(
    novelId: string,
    chapterId: string,
    scope: "full" | AuditType = "full",
    options: AuditOptions = {},
  ): Promise<{ score: QualityScore; issues: ReviewIssue[]; auditReports: AuditReport[] }> {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      include: {
        novel: {
          select: {
            title: true,
          },
        },
      },
    });
    if (!chapter) {
      throw new Error("章节不存在。");
    }
    const content = options.content ?? chapter.content ?? "";
    const requestedTypes: AuditType[] = scope === "full" ? ["continuity", "character", "plot", "mode_fit"] : [scope];
    if (!content.trim()) {
      const score = normalizeScore({});
      const reports = await this.persistAuditReports(novelId, chapterId, score, requestedTypes.map((type) => ({
        auditType: type,
        overallScore: 0,
        summary: "章节内容为空。",
        issues: [{
          severity: "critical",
          code: `${type}_empty`,
          description: "章节内容为空，无法完成审计。",
          evidence: "chapter content empty",
          fixSuggestion: "先生成或补全章节内容，再重新审计。",
        }],
      })));
      return {
        score,
        issues: [{
          severity: "critical",
          category: "coherence",
          evidence: "章节内容为空",
          fixSuggestion: "先生成或补全正文，再进行审校",
        }],
        auditReports: reports,
      };
    }
    const structured = await this.invokeAuditLLM(novelId, chapter.novel.title, chapter.title, content, requestedTypes, options);
    const score = normalizeScore(structured.score ?? ruleScore(content));
    const auditReportsInput = requestedTypes.map((type) => {
      const matched = structured.auditReports?.find((item) => normalizeAuditType(item.auditType) === type);
      return {
        auditType: type,
        overallScore: typeof matched?.overallScore === "number" ? matched.overallScore : score.overall,
        summary: matched?.summary?.trim() || `${type} 审计已生成。`,
        issues: (matched?.issues ?? []).map((issue, index) => ({
          severity: normalizeSeverity(issue.severity),
          code: issue.code?.trim() || `${type}_${index + 1}`,
          description: issue.description?.trim() || `${type} 审计问题`,
          evidence: issue.evidence?.trim() || "未提供证据",
          fixSuggestion: issue.fixSuggestion?.trim() || "请根据上下文修复该问题。",
        })),
      };
    });
    const persistedReports = await this.persistAuditReports(novelId, chapterId, score, auditReportsInput);
    const chapterOrder = chapter.order;
    const sourceSnapshot = await prisma.storyStateSnapshot.findFirst({
      where: { novelId, sourceChapterId: chapterId },
      select: { id: true },
    });
    await openConflictService.syncFromAuditReports({
      novelId,
      chapterId,
      chapterOrder,
      sourceSnapshotId: sourceSnapshot?.id ?? null,
      auditReports: persistedReports,
    });
    const ledger = await payoffLedgerSyncService.syncLedger(novelId, {
      chapterOrder,
      sourceChapterId: chapterId,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
    }).catch(() => null);
    const syntheticPayoffReports = ledger
      ? payoffLedgerSyncService.buildSyntheticAuditReports(novelId, chapterId, chapterOrder, ledger)
      : [];
    const syntheticLengthReports = this.buildSyntheticLengthAuditReports(
      novelId,
      chapterId,
      content,
      options.contextPackage ?? null,
      options.lengthControl,
    );
    const mergedReports = [
      ...persistedReports,
      ...syntheticPayoffReports,
      ...syntheticLengthReports,
    ];
    const issues = this.buildLegacyIssues(structured.issues ?? [], mergedReports);
    return {
      score,
      issues,
      auditReports: mergedReports,
    };
  }

  async listChapterAuditReports(novelId: string, chapterId: string): Promise<AuditReport[]> {
    return prisma.auditReport.findMany({
      where: { novelId, chapterId },
      include: {
        issues: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ createdAt: "desc" }, { auditType: "asc" }],
    }) as unknown as Promise<AuditReport[]>;
  }

  async resolveIssues(novelId: string, issueIds: string[]) {
    if (issueIds.length === 0) {
      return [];
    }
    const issues = await prisma.auditIssue.findMany({
      where: { id: { in: issueIds } },
      include: {
        report: {
          select: { novelId: true },
        },
      },
    });
    const ownedIds = issues.filter((item) => item.report.novelId === novelId).map((item) => item.id);
    if (ownedIds.length === 0) {
      return [];
    }
    await prisma.auditIssue.updateMany({
      where: { id: { in: ownedIds } },
      data: { status: "resolved" },
    });
    await openConflictService.resolveFromAuditIssueIds(novelId, ownedIds);
    return prisma.auditIssue.findMany({
      where: { id: { in: ownedIds } },
      orderBy: { updatedAt: "desc" },
    });
  }

  private async invokeAuditLLM(
    novelId: string,
    novelTitle: string,
    chapterTitle: string,
    content: string,
    requestedTypes: AuditType[],
    options: AuditOptions,
  ): Promise<FullAuditOutput> {
    try {
      let ragContext = "";
      let storyModeContext = "";
      try {
        ragContext = await ragServices.hybridRetrievalService.buildContextBlock(
          content,
          {
            novelId,
            ownerTypes: ["novel", "chapter", "chapter_summary", "consistency_fact", "character", "bible"],
            finalTopK: 6,
          },
        );
      } catch {
        ragContext = "";
      }
      try {
        const novel = await prisma.novel.findUnique({
          where: { id: novelId },
          select: {
            primaryStoryMode: {
              select: {
                id: true,
                name: true,
                description: true,
                template: true,
                parentId: true,
                profileJson: true,
                createdAt: true,
                updatedAt: true,
              },
            },
            secondaryStoryMode: {
              select: {
                id: true,
                name: true,
                description: true,
                template: true,
                parentId: true,
                profileJson: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        });
        if (novel) {
          storyModeContext = buildStoryModePromptBlock({
            primary: novel.primaryStoryMode ? normalizeStoryModeOutput(novel.primaryStoryMode) : null,
            secondary: novel.secondaryStoryMode ? normalizeStoryModeOutput(novel.secondaryStoryMode) : null,
          });
        }
      } catch {
        storyModeContext = "";
      }
      const result = await runStructuredPrompt({
        asset: auditChapterPrompt,
        promptInput: {
          novelTitle,
          chapterTitle,
          requestedTypes,
          storyModeContext,
          content,
          ragContext,
        },
        contextBlocks: options.contextPackage?.chapterReviewContext
          ? buildChapterReviewContextBlocks(options.contextPackage.chapterReviewContext)
          : undefined,
        options: {
          provider: options.provider,
          model: options.model,
          temperature: options.temperature ?? 0.1,
        },
      });
      return result.output;
    } catch {
      return parseLegacyReviewOutput(content);
    }
  }

  private buildSyntheticLengthAuditReports(
    novelId: string,
    chapterId: string,
    content: string,
    contextPackage: GenerationContextPackage | null,
    lengthControl?: ChapterRuntimePackage["lengthControl"],
  ): AuditReport[] {
    const budget = contextPackage?.chapterWriteContext?.lengthBudget ?? null;
    if (!budget) {
      return [];
    }
    if (!lengthControl || lengthControl.wordControlMode === "prompt_only") {
      return [];
    }

    const finalWordCount = countChapterCharacters(content);
    const issues: AuditReport["issues"] = [];
    const reportId = `length-control:${novelId}:${chapterId}`;
    const now = new Date().toISOString();

    if (finalWordCount < budget.softMinWordCount) {
      issues.push({
        id: `${reportId}:under-soft-min`,
        reportId,
        auditType: "plot",
        severity: "high",
        code: "LENGTH_UNDER_SOFT_MIN",
        description: "章节正文低于软下限，当前篇幅不足以稳定承接本章职责。",
        evidence: `final=${finalWordCount}, softMin=${budget.softMinWordCount}, target=${budget.targetWordCount}`,
        fixSuggestion: "优先补写最后一个义务场景或结尾 hook，增加有效推进而不是回顾性填充。",
        status: "open",
        createdAt: now,
        updatedAt: now,
      });
    }

    if (finalWordCount > budget.softMaxWordCount) {
      issues.push({
        id: `${reportId}:over-soft-max`,
        reportId,
        auditType: "plot",
        severity: finalWordCount > budget.hardMaxWordCount ? "high" : "medium",
        code: "LENGTH_OVER_SOFT_MAX",
        description: "章节正文超过软上限，当前节奏已出现明显篇幅漂移。",
        evidence: `final=${finalWordCount}, softMax=${budget.softMaxWordCount}, target=${budget.targetWordCount}`,
        fixSuggestion: "优先压缩尾段低信息量描写、重复反应和解释段，保留关键推进与结尾压力。",
        status: "open",
        createdAt: now,
        updatedAt: now,
      });
    }

    if (finalWordCount > budget.hardMaxWordCount) {
      issues.push({
        id: `${reportId}:over-hard-max`,
        reportId,
        auditType: "plot",
        severity: "critical",
        code: "LENGTH_OVER_HARD_MAX",
        description: "章节正文超过硬上限，当前长度已经失控。",
        evidence: `final=${finalWordCount}, hardMax=${budget.hardMaxWordCount}, target=${budget.targetWordCount}`,
        fixSuggestion: "执行整章压缩，删除重复段落和无效回合，必要时回收最后两个场景的冗余展开。",
        status: "open",
        createdAt: now,
        updatedAt: now,
      });
    }

    const driftResults = lengthControl?.sceneResults.filter((scene) => {
      const upperBound = Math.ceil(scene.targetWordCount * 1.2);
      const lowerBound = Math.floor(scene.targetWordCount * 0.8);
      return scene.actualWordCount > upperBound || scene.actualWordCount < lowerBound;
    }) ?? [];
    if (driftResults.length > 0) {
      const driftSummary = driftResults
        .slice(0, 3)
        .map((scene) => `${scene.sceneTitle} actual=${scene.actualWordCount} target=${scene.targetWordCount}`)
        .join(" | ");
      issues.push({
        id: `${reportId}:scene-budget-drift`,
        reportId,
        auditType: "plot",
        severity: "medium",
        code: "SCENE_BUDGET_DRIFT",
        description: "部分场景明显偏离预算，说明章节节奏控制还不稳定。",
        evidence: driftSummary,
        fixSuggestion: "回收超预算场景的重复描写，或给明显不足的收尾场景补足必要推进。",
        status: "open",
        createdAt: now,
        updatedAt: now,
      });
    }

    if (issues.length === 0) {
      return [];
    }

    return [{
      id: reportId,
      novelId,
      chapterId,
      auditType: "plot",
      overallScore: null,
      summary: "系统根据章节长度预算补充了篇幅与场景节奏风险。",
      legacyScoreJson: null,
      issues,
      createdAt: now,
      updatedAt: now,
    }];
  }

  private buildLegacyIssues(structuredIssues: ReviewIssue[], auditReports: AuditReport[]): ReviewIssue[] {
    if (structuredIssues.length > 0) {
      return structuredIssues;
    }
    return auditReports
      .flatMap((report) => report.issues.slice(0, 3).map((issue) => ({
        severity: issue.severity,
        category: LEGACY_CATEGORY_MAP[report.auditType],
        evidence: issue.evidence,
        fixSuggestion: issue.fixSuggestion,
      })))
      .slice(0, 8);
  }

  private async persistAuditReports(
    novelId: string,
    chapterId: string,
    score: QualityScore,
    reports: Array<{
      auditType: AuditType;
      overallScore?: number;
      summary?: string;
      issues: Array<{
        severity: "low" | "medium" | "high" | "critical";
        code: string;
        description: string;
        evidence: string;
        fixSuggestion: string;
      }>;
    }>,
  ): Promise<AuditReport[]> {
    await prisma.$transaction(async (tx) => {
      await tx.auditReport.deleteMany({
        where: {
          novelId,
          chapterId,
          auditType: { in: reports.map((item) => item.auditType) },
        },
      });
      for (const report of reports) {
        await tx.auditReport.create({
          data: {
            novelId,
            chapterId,
            auditType: report.auditType,
            overallScore: typeof report.overallScore === "number" ? report.overallScore : score.overall,
            summary: report.summary ?? null,
            legacyScoreJson: JSON.stringify(score),
            issues: {
              create: report.issues.map((issue) => ({
                auditType: report.auditType,
                severity: issue.severity,
                code: issue.code,
                description: issue.description,
                evidence: issue.evidence,
                fixSuggestion: issue.fixSuggestion,
              })),
            },
          },
        });
      }
    });
    return prisma.auditReport.findMany({
      where: { novelId, chapterId, auditType: { in: reports.map((item) => item.auditType) } },
      include: {
        issues: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }) as unknown as Promise<AuditReport[]>;
  }
}

export const auditService = new AuditService();
