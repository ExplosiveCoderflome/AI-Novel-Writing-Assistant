import { prisma } from "../../db/prisma";
import { AgentToolError, type AgentToolName } from "../types";
import type { AgentToolDefinition } from "./toolTypes";
import {
  auditChapterContinuityInputSchema,
  auditChapterContinuityOutputSchema,
  bookAnalysisIdInputSchema,
  getBookAnalysisDetailOutputSchema,
  getBookAnalysisFailureReasonOutputSchema,
  listBookAnalysesInputSchema,
  listBookAnalysesOutputSchema,
} from "./bookAnalysisToolSchemas";

export const bookAnalysisToolDefinitions: Partial<
  Record<AgentToolName, AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>>
> = {
  list_book_analyses: {
    name: "list_book_analyses",
    title: "列出拆书任务",
    description: "读取拆书分析任务列表、状态和最近错误。",
    category: "read",
    riskLevel: "low",
    domainAgent: "BookAnalysisAgent",
    resourceScopes: ["book_analysis", "knowledge_document", "task"],
    inputSchema: listBookAnalysesInputSchema,
    outputSchema: listBookAnalysesOutputSchema,
    execute: async (_context, rawInput) => {
      const input = listBookAnalysesInputSchema.parse(rawInput);
      const rows = await prisma.bookAnalysis.findMany({
        where: {
          ...(input.documentId ? { documentId: input.documentId } : {}),
          ...(input.status ? { status: input.status } : {}),
        },
        include: {
          document: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: input.limit ?? 20,
      });
      return listBookAnalysesOutputSchema.parse({
        items: rows.map((row) => ({
          id: row.id,
          title: row.title,
          documentId: row.documentId,
          documentTitle: row.document.title,
          status: row.status,
          progress: row.progress,
          currentStage: row.currentStage ?? null,
          lastError: row.lastError ?? null,
          updatedAt: row.updatedAt.toISOString(),
        })),
        summary: `已读取 ${rows.length} 个拆书任务。`,
      });
    },
  },
  get_book_analysis_detail: {
    name: "get_book_analysis_detail",
    title: "读取拆书详情",
    description: "读取单个拆书任务的进度、章节数和最近状态。",
    category: "read",
    riskLevel: "low",
    domainAgent: "BookAnalysisAgent",
    resourceScopes: ["book_analysis", "knowledge_document"],
    inputSchema: bookAnalysisIdInputSchema,
    outputSchema: getBookAnalysisDetailOutputSchema,
    execute: async (_context, rawInput) => {
      const input = bookAnalysisIdInputSchema.parse(rawInput);
      const row = await prisma.bookAnalysis.findUnique({
        where: { id: input.analysisId },
        include: {
          document: {
            select: {
              id: true,
              title: true,
            },
          },
          sections: {
            select: { id: true },
          },
        },
      });
      if (!row) {
        throw new AgentToolError("NOT_FOUND", "Book analysis not found.");
      }
      return getBookAnalysisDetailOutputSchema.parse({
        id: row.id,
        title: row.title,
        documentId: row.documentId,
        documentTitle: row.document.title,
        status: row.status,
        summary: row.summary ?? null,
        progress: row.progress,
        currentStage: row.currentStage ?? null,
        currentItemLabel: row.currentItemLabel ?? null,
        lastError: row.lastError ?? null,
        sectionCount: row.sections.length,
        updatedAt: row.updatedAt.toISOString(),
      });
    },
  },
  get_book_analysis_failure_reason: {
    name: "get_book_analysis_failure_reason",
    title: "解释拆书失败原因",
    description: "解释拆书任务失败、阻塞或当前不可继续的原因。",
    category: "inspect",
    riskLevel: "low",
    domainAgent: "BookAnalysisAgent",
    resourceScopes: ["book_analysis", "task"],
    inputSchema: bookAnalysisIdInputSchema,
    outputSchema: getBookAnalysisFailureReasonOutputSchema,
    execute: async (_context, rawInput) => {
      const input = bookAnalysisIdInputSchema.parse(rawInput);
      const row = await prisma.bookAnalysis.findUnique({
        where: { id: input.analysisId },
      });
      if (!row) {
        throw new AgentToolError("NOT_FOUND", "Book analysis not found.");
      }
      const failureSummary = row.status === "failed"
        ? (row.lastError?.trim() || "拆书任务失败，但没有记录明确错误。")
        : row.status === "cancelled"
          ? "拆书任务已取消。"
          : row.status === "running"
            ? "拆书任务仍在执行中，并未失败。"
            : row.status === "queued"
              ? "拆书任务仍在排队，尚未开始执行。"
              : "当前拆书任务没有失败记录。";
      const recoveryHint = row.status === "failed"
        ? "可检查文档内容完整性、模型配置和最近一次章节生成记录，再决定是否重试。"
        : row.status === "running"
          ? "建议等待当前任务完成，或在任务中心查看实时进度。"
          : row.status === "queued"
            ? "建议检查队列压力和模型可用性，确认任务是否被调度。"
            : "当前无需恢复操作。";
      return getBookAnalysisFailureReasonOutputSchema.parse({
        analysisId: row.id,
        status: row.status,
        failureSummary,
        failureDetails: row.lastError ?? null,
        recoveryHint,
        summary: failureSummary,
      });
    },
  },
  audit_chapter_continuity: {
    name: "audit_chapter_continuity",
    title: "章节连续性诊断",
    description: "扫描指定章节范围的已生成正文，检测重复场景模式（时间+地点+动作三要素重复）和章节开头重复模式，并输出诊断报告。不需要 LLM，直接基于章节内容进行结构检测。",
    category: "inspect",
    riskLevel: "low",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "chapter"],
    parserHints: {
      intent: "inspect_failure_reason",
      aliases: ["章节连续性诊断", "章节重复检测", "剧情一致性检查", "audit chapter continuity"],
      phrases: [
        "检查章节有没有重复",
        "看看哪些章节内容重复了",
        "诊断小说的连续性问题",
        "哪些场景被重复写了",
        "开头有没有模式重复",
      ],
      requiresNovelContext: true,
      whenToUse: "用户想诊断已生成章节中的重复场景模式、开头重复或里程碑状态问题。",
      whenNotToUse: "用户在查询任务状态或生产进度。",
    },
    inputSchema: auditChapterContinuityInputSchema,
    outputSchema: auditChapterContinuityOutputSchema,
    execute: async (context, rawInput) => {
      const input = auditChapterContinuityInputSchema.parse(rawInput);
      const novelId = input.novelId?.trim() || context.novelId;
      if (!novelId) {
        throw new AgentToolError("INVALID_INPUT", "没有当前小说上下文，无法执行连续性诊断。");
      }

      const chapters = await prisma.chapter.findMany({
        where: {
          novelId,
          order: {
            gte: input.startOrder ?? 1,
            ...(input.endOrder != null ? { lte: input.endOrder } : {}),
          },
          NOT: { content: null },
        },
        orderBy: { order: "asc" },
        select: { id: true, order: true, title: true, content: true },
      });

      if (chapters.length === 0) {
        return auditChapterContinuityOutputSchema.parse({
          novelId,
          checkedRange: `ch${input.startOrder ?? 1}-end`,
          chapterCount: 0,
          milestoneBreaks: [],
          repetitionClusters: [],
          openingPatternClusters: [],
          hasCriticalIssues: false,
          summary: "指定范围内没有已生成的章节正文，无法执行诊断。",
          recommendation: "请先生成章节正文再执行诊断。",
        });
      }

      const OPENING_LENGTH = 120;
      const SCENE_PATTERN_KEYWORDS = [
        ["凌晨", "旅馆", "蹲"],
        ["凌晨", "蹲守"],
        ["街道办", "盖章"],
        ["街道办", "章"],
        ["工商", "执照"],
        ["工商", "章"],
        ["摊位", "合同"],
        ["摊位", "签"],
        ["凌晨四点"],
        ["凌晨四"],
        ["尾随", "跟丢"],
        ["明天一早"],
      ];

      function extractOpeningSnippet(content: string): string {
        return content.replace(/\s+/g, "").slice(0, OPENING_LENGTH);
      }

      function matchesPatternGroup(content: string, keywords: string[]): boolean {
        return keywords.every((kw) => content.includes(kw));
      }

      const repetitionMap = new Map<string, number[]>();
      const openingMap = new Map<string, number[]>();

      for (const chapter of chapters) {
        if (!chapter.content) {
          continue;
        }
        const content = chapter.content;
        for (const patternGroup of SCENE_PATTERN_KEYWORDS) {
          if (matchesPatternGroup(content, patternGroup)) {
            const key = patternGroup.join("+");
            const existing = repetitionMap.get(key) ?? [];
            existing.push(chapter.order);
            repetitionMap.set(key, existing);
          }
        }
        const opening = extractOpeningSnippet(content);
        if (opening.length >= 30) {
          const prefix = opening.slice(0, 30);
          const existing = openingMap.get(prefix) ?? [];
          existing.push(chapter.order);
          openingMap.set(prefix, existing);
        }
      }

      const repetitionClusters = Array.from(repetitionMap.entries())
        .filter(([, orders]) => orders.length >= 2)
        .map(([pattern, occurrences]) => ({ pattern, occurrences }));

      const openingPatternClusters = Array.from(openingMap.entries())
        .filter(([, orders]) => orders.length >= 3)
        .map(([pattern, occurrences]) => ({ pattern: `开头相同片段：${pattern}`, occurrences }));

      const hasCriticalIssues = repetitionClusters.some((c) => c.occurrences.length >= 3)
        || openingPatternClusters.length > 0;

      const firstOrder = chapters[0]?.order ?? (input.startOrder ?? 1);
      const lastOrder = chapters[chapters.length - 1]?.order ?? firstOrder;
      const checkedRange = `ch${firstOrder}-ch${lastOrder}`;

      const issueLines: string[] = [
        ...repetitionClusters.map((c) => `场景重复 [${c.pattern}] 出现于第 ${c.occurrences.join("、")} 章`),
        ...openingPatternClusters.map((c) => `开头重复 出现于第 ${c.occurrences.join("、")} 章`),
      ];

      const summary = issueLines.length > 0
        ? `发现 ${issueLines.length} 处连续性问题：${issueLines.slice(0, 3).join("；")}`
        : `在 ${checkedRange} 共 ${chapters.length} 章中未检测到明显重复模式。`;

      const recommendation = issueLines.length > 0
        ? "建议：1) 将重复场景的章节加入 recentScenePatterns 黑名单，防止后续章节继续重复；2) 手动或通过 apply_chapter_patch 修复重复章节的内容差异化。"
        : "章节连续性良好，无需修复。";

      return auditChapterContinuityOutputSchema.parse({
        novelId,
        checkedRange,
        chapterCount: chapters.length,
        milestoneBreaks: [],
        repetitionClusters,
        openingPatternClusters,
        hasCriticalIssues,
        summary,
        recommendation,
      });
    },
  },
};
