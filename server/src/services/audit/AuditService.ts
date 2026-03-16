import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { AuditReport, AuditType, QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import { prisma } from "../../db/prisma";
import { getLLM } from "../../llm/factory";
import {
  normalizeAuditType,
  normalizeScore,
  normalizeSeverity,
  parseJSONObject,
  parseLegacyReviewOutput,
  ruleScore,
  toText,
} from "../novel/novelP0Utils";
import { ragServices } from "../rag";

interface AuditOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  content?: string;
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
};

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
    const requestedTypes: AuditType[] = scope === "full" ? ["continuity", "character", "plot"] : [scope];
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
    const issues = this.buildLegacyIssues(structured.issues ?? [], persistedReports);
    return {
      score,
      issues,
      auditReports: persistedReports,
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
      const llm = await getLLM(options.provider ?? "deepseek", {
        model: options.model,
        temperature: options.temperature ?? 0.1,
        taskType: "review",
      });
      let ragContext = "";
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
      const result = await llm.invoke([
        new SystemMessage(
          "你是小说审计器。请严格输出 JSON，字段为 score, issues, auditReports。auditReports 只允许 continuity/character/plot。每个 issue 必须给 severity, code, description, evidence, fixSuggestion。",
        ),
        new HumanMessage(
          `小说：${novelTitle}
章节：${chapterTitle}
审计范围：${requestedTypes.join(",")}

正文：
${content}

检索补充：
${ragContext || "无"}

要求：
1. score 维持兼容字段 coherence, repetition, pacing, voice, engagement, overall。
2. issues 输出旧版兼容问题数组。
3. auditReports 输出结构化审计结果，至少覆盖请求的类型。`,
        ),
      ]);
      return parseJSONObject<FullAuditOutput>(toText(result.content));
    } catch {
      return parseLegacyReviewOutput(content);
    }
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
