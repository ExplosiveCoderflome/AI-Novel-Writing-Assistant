import { prisma } from "../../db/prisma";
import { AgentToolError, type AgentToolName } from "../types";
import type { AgentToolDefinition } from "./toolTypes";
import {
  analyzeQualityDebtAttributionInputSchema,
  analyzeQualityDebtAttributionOutputSchema,
  auditChapterContinuityInputSchema,
  auditChapterContinuityOutputSchema,
  bookAnalysisIdInputSchema,
  getBookAnalysisDetailOutputSchema,
  getBookAnalysisFailureReasonOutputSchema,
  listBookAnalysesInputSchema,
  listBookAnalysesOutputSchema,
  type QualityDebtChapterAttribution,
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

  analyze_quality_debt_attribution: {
    name: "analyze_quality_debt_attribution",
    title: "质量债务根因归因分析",
    description: "扫描已记录质量债务（defer_and_continue）的章节，聚合根因 A/B/D/E 占比、Top 失败 issue code 和缺失义务种类，产出决策报告。不需要 LLM，基于 riskFlags 数据直接计算。",
    category: "inspect",
    riskLevel: "low",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "chapter"],
    parserHints: {
      intent: "inspect_failure_reason",
      aliases: ["质量债务归因", "质量债务分析", "根因分析", "analyze quality debt", "quality debt attribution"],
      phrases: [
        "为什么章节总是修复失败",
        "质量债务的根本原因是什么",
        "分析哪些章节有质量问题",
        "质量债务根因报告",
        "修复失败的原因统计",
      ],
      requiresNovelContext: true,
      whenToUse: "用户想了解已记录质量债务章节的根因分布，以决定优化方向。",
      whenNotToUse: "用户在查询单章详细内容或生成状态。",
    },
    inputSchema: analyzeQualityDebtAttributionInputSchema,
    outputSchema: analyzeQualityDebtAttributionOutputSchema,
    execute: async (context, rawInput) => {
      const input = analyzeQualityDebtAttributionInputSchema.parse(rawInput);
      const novelId = input.novelId?.trim() || context.novelId;
      if (!novelId) {
        throw new AgentToolError("INVALID_INPUT", "没有当前小说上下文，无法执行质量债务归因分析。");
      }

      const chapters = await prisma.chapter.findMany({
        where: {
          novelId,
          order: {
            gte: input.startOrder ?? 1,
            ...(input.endOrder != null ? { lte: input.endOrder } : {}),
          },
          riskFlags: { not: null },
        },
        orderBy: { order: "asc" },
        select: { id: true, order: true, title: true, riskFlags: true },
      });

      // 过滤出 terminalAction = defer_and_continue 的章节
      const deferredChapters: QualityDebtChapterAttribution[] = [];

      for (const chapter of chapters) {
        let riskFlagsObj: Record<string, unknown> = {};
        try {
          if (chapter.riskFlags) {
            const parsed = JSON.parse(chapter.riskFlags) as unknown;
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              riskFlagsObj = parsed as Record<string, unknown>;
            }
          }
        } catch {
          continue;
        }

        const qualityLoop = riskFlagsObj.qualityLoop;
        if (!qualityLoop || typeof qualityLoop !== "object" || Array.isArray(qualityLoop)) {
          continue;
        }
        const loop = qualityLoop as Record<string, unknown>;
        if (loop.terminalAction !== "defer_and_continue") {
          continue;
        }

        const attribution = loop.qualityDebtAttribution;
        if (!attribution || typeof attribution !== "object" || Array.isArray(attribution)) {
          // 旧数据，无归因信息
          deferredChapters.push({
            chapterOrder: chapter.order,
            chapterId: chapter.id,
            title: chapter.title ?? `第${chapter.order}章`,
            firstFailureIssueCodes: [],
            secondFailureIssueCodes: [],
            firstFailureClassificationCode: null,
            patchAnchorFailed: false,
            sameObligationRepeated: false,
            planMisaligned: false,
            lengthVsContentDrift: false,
            missingObligationKinds: [],
            primaryRootCause: "unknown",
          });
          continue;
        }

        const attr = attribution as Record<string, unknown>;
        const firstIssueCodes = Array.isArray(attr.firstFailureIssueCodes)
          ? attr.firstFailureIssueCodes.filter((c): c is string => typeof c === "string")
          : [];
        const secondIssueCodes = Array.isArray(attr.secondFailureIssueCodes)
          ? attr.secondFailureIssueCodes.filter((c): c is string => typeof c === "string")
          : [];
        const obligationKinds = Array.isArray(attr.missingObligationKinds)
          ? attr.missingObligationKinds.filter((k): k is string => typeof k === "string")
          : [];
        const patchAnchorFailed = attr.patchAnchorFailed === true;
        const sameObligationRepeated = attr.sameObligationRepeated === true;
        const planMisaligned = attr.planMisaligned === true;
        const lengthVsContentDrift = attr.lengthVsContentDrift === true;
        const classCode = typeof attr.firstFailureClassificationCode === "string"
          ? attr.firstFailureClassificationCode
          : null;

        // 推断主要根因（优先级：D > B > A > E > unknown）
        let primaryRootCause: QualityDebtChapterAttribution["primaryRootCause"] = "unknown";
        if (planMisaligned) {
          primaryRootCause = "D";
        } else if (patchAnchorFailed) {
          primaryRootCause = "B";
        } else if (sameObligationRepeated) {
          primaryRootCause = "A";
        } else if (lengthVsContentDrift) {
          primaryRootCause = "E";
        }

        deferredChapters.push({
          chapterOrder: chapter.order,
          chapterId: chapter.id,
          title: chapter.title ?? `第${chapter.order}章`,
          firstFailureIssueCodes: firstIssueCodes,
          secondFailureIssueCodes: secondIssueCodes,
          firstFailureClassificationCode: classCode,
          patchAnchorFailed,
          sameObligationRepeated,
          planMisaligned,
          lengthVsContentDrift,
          missingObligationKinds: obligationKinds,
          primaryRootCause,
        });
      }

      const attributed = deferredChapters.filter((c) => c.primaryRootCause !== "unknown" || c.firstFailureIssueCodes.length > 0);
      const attributedCount = attributed.length;
      const totalDeferred = deferredChapters.length;

      // 根因占比
      const countByRoot = { A: 0, B: 0, D: 0, E: 0, unknown: 0 };
      for (const c of deferredChapters) {
        countByRoot[c.primaryRootCause] += 1;
      }
      const denominator = totalDeferred || 1;
      const rootCauseRatios = {
        A: Number((countByRoot.A / denominator).toFixed(3)),
        B: Number((countByRoot.B / denominator).toFixed(3)),
        D: Number((countByRoot.D / denominator).toFixed(3)),
        E: Number((countByRoot.E / denominator).toFixed(3)),
        unknown: Number((countByRoot.unknown / denominator).toFixed(3)),
      };

      // Top 失败 issue code
      const issueCodeCount: Record<string, number> = {};
      for (const c of deferredChapters) {
        for (const code of [...c.firstFailureIssueCodes, ...c.secondFailureIssueCodes]) {
          issueCodeCount[code] = (issueCodeCount[code] ?? 0) + 1;
        }
      }
      const topFailureIssueCodes = Object.entries(issueCodeCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([code, count]) => ({ code, count }));

      // Top 缺失义务种类
      const obligationKindCount: Record<string, number> = {};
      for (const c of deferredChapters) {
        for (const kind of c.missingObligationKinds) {
          obligationKindCount[kind] = (obligationKindCount[kind] ?? 0) + 1;
        }
      }
      const topMissingObligationKinds = Object.entries(obligationKindCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([kind, count]) => ({ kind, count }));

      // 生成决策建议
      const dominantRoot = Object.entries(countByRoot)
        .filter(([k]) => k !== "unknown")
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
      const recommendationMap: Record<string, string> = {
        D: "根因 D（义务不可达）占主导 → 优先实施阶段一懒规划，JIT task sheet 生成可直接解决。",
        A: "根因 A（开环修复）占主导 → 优先修复修复闭环（1.D 子项），让修复器拿到结构化义务。",
        B: "根因 B（patch 锚点失配）占主导 → 考虑将 patchRepair 预算提到 2，并允许宽松锚点重试。",
        E: "根因 E（签名漂移）占主导 → 拆分 length/content issueSignature 分别计预算。",
        unknown: "暂无足够归因数据，建议运行更多章节后再分析。",
      };
      const recommendation = totalDeferred === 0
        ? "当前小说没有记录质量债务章节，无需处理。"
        : recommendationMap[dominantRoot] ?? recommendationMap.unknown;

      const startOrder = input.startOrder ?? 1;
      const endOrder = input.endOrder ?? chapters[chapters.length - 1]?.order ?? startOrder;
      const checkedRange = `ch${startOrder}-${endOrder}`;

      return analyzeQualityDebtAttributionOutputSchema.parse({
        novelId,
        checkedRange,
        totalDeferredChapters: totalDeferred,
        attributedChapters: attributedCount,
        rootCauseRatios,
        topFailureIssueCodes,
        topMissingObligationKinds,
        chapters: deferredChapters,
        recommendation,
      });
    },
  },
};
