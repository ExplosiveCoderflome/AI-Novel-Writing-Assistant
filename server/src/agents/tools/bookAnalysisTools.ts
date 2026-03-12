import { z } from "zod";
import { prisma } from "../../db/prisma";
import { AgentToolError, type AgentToolName } from "../types";
import type { AgentToolDefinition } from "./toolTypes";

const listBookAnalysesInput = z.object({
  documentId: z.string().trim().optional(),
  status: z.enum(["draft", "queued", "running", "succeeded", "failed", "cancelled", "archived"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const bookAnalysisSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  documentId: z.string(),
  documentTitle: z.string(),
  status: z.string(),
  progress: z.number(),
  currentStage: z.string().nullable(),
  lastError: z.string().nullable(),
  updatedAt: z.string(),
});

const listBookAnalysesOutput = z.object({
  items: z.array(bookAnalysisSummarySchema),
  summary: z.string(),
});

const getBookAnalysisDetailInput = z.object({
  analysisId: z.string().trim().min(1),
});

const getBookAnalysisDetailOutput = z.object({
  id: z.string(),
  title: z.string(),
  documentId: z.string(),
  documentTitle: z.string(),
  status: z.string(),
  summary: z.string().nullable(),
  progress: z.number(),
  currentStage: z.string().nullable(),
  currentItemLabel: z.string().nullable(),
  lastError: z.string().nullable(),
  sectionCount: z.number().int(),
  updatedAt: z.string(),
});

const getBookAnalysisFailureReasonOutput = z.object({
  analysisId: z.string(),
  status: z.string(),
  failureSummary: z.string(),
  failureDetails: z.string().nullable(),
  recoveryHint: z.string(),
  summary: z.string(),
});

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
    inputSchema: listBookAnalysesInput,
    outputSchema: listBookAnalysesOutput,
    execute: async (_context, rawInput) => {
      const input = listBookAnalysesInput.parse(rawInput);
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
      return listBookAnalysesOutput.parse({
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
    inputSchema: getBookAnalysisDetailInput,
    outputSchema: getBookAnalysisDetailOutput,
    execute: async (_context, rawInput) => {
      const input = getBookAnalysisDetailInput.parse(rawInput);
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
      return getBookAnalysisDetailOutput.parse({
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
    inputSchema: getBookAnalysisDetailInput,
    outputSchema: getBookAnalysisFailureReasonOutput,
    execute: async (_context, rawInput) => {
      const input = getBookAnalysisDetailInput.parse(rawInput);
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
      return getBookAnalysisFailureReasonOutput.parse({
        analysisId: row.id,
        status: row.status,
        failureSummary,
        failureDetails: row.lastError ?? null,
        recoveryHint,
        summary: failureSummary,
      });
    },
  },
};
