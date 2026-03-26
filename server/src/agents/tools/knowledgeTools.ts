import { prisma } from "../../db/prisma";
import { AgentToolError, type AgentToolName } from "../types";
import type { AgentToolDefinition } from "./toolTypes";
import {
  getIndexFailureReasonOutputSchema,
  getKnowledgeDocumentDetailOutputSchema,
  knowledgeDocumentIdInputSchema,
  listKnowledgeDocumentsInputSchema,
  listKnowledgeDocumentsOutputSchema,
} from "./knowledgeToolSchemas";

export const knowledgeToolDefinitions: Partial<
  Record<AgentToolName, AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>>
> = {
  list_knowledge_documents: {
    name: "list_knowledge_documents",
    title: "列出知识文档",
    description: "读取知识库文档、索引状态和最近一次索引错误。",
    category: "read",
    riskLevel: "low",
    domainAgent: "KnowledgeAgent",
    resourceScopes: ["knowledge_document", "task"],
    inputSchema: listKnowledgeDocumentsInputSchema,
    outputSchema: listKnowledgeDocumentsOutputSchema,
    execute: async (_context, rawInput) => {
      const input = listKnowledgeDocumentsInputSchema.parse(rawInput);
      const rows = await prisma.knowledgeDocument.findMany({
        where: input.status ? { status: input.status } : {},
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: input.limit ?? 20,
      });
      const latestJobs = await prisma.ragIndexJob.findMany({
        where: {
          ownerType: "knowledge_document",
          ownerId: { in: rows.map((item) => item.id) },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      });
      const latestJobMap = new Map<string, (typeof latestJobs)[number]>();
      for (const job of latestJobs) {
        if (!latestJobMap.has(job.ownerId)) {
          latestJobMap.set(job.ownerId, job);
        }
      }
      return listKnowledgeDocumentsOutputSchema.parse({
        items: rows.map((row) => ({
          id: row.id,
          title: row.title,
          fileName: row.fileName,
          status: row.status,
          latestIndexStatus: row.latestIndexStatus,
          lastIndexedAt: row.lastIndexedAt?.toISOString() ?? null,
          latestIndexError: latestJobMap.get(row.id)?.lastError ?? null,
        })),
        summary: `已读取 ${rows.length} 个知识文档。`,
      });
    },
  },
  get_knowledge_document_detail: {
    name: "get_knowledge_document_detail",
    title: "读取知识文档详情",
    description: "读取知识文档详情、版本数、绑定数和索引状态。",
    category: "read",
    riskLevel: "low",
    domainAgent: "KnowledgeAgent",
    resourceScopes: ["knowledge_document"],
    inputSchema: knowledgeDocumentIdInputSchema,
    outputSchema: getKnowledgeDocumentDetailOutputSchema,
    execute: async (_context, rawInput) => {
      const input = knowledgeDocumentIdInputSchema.parse(rawInput);
      const row = await prisma.knowledgeDocument.findUnique({
        where: { id: input.documentId },
        include: {
          versions: {
            select: { id: true },
          },
          bindings: {
            select: { id: true },
          },
        },
      });
      if (!row) {
        throw new AgentToolError("NOT_FOUND", "Knowledge document not found.");
      }
      const latestJob = await prisma.ragIndexJob.findFirst({
        where: {
          ownerType: "knowledge_document",
          ownerId: row.id,
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      });
      return getKnowledgeDocumentDetailOutputSchema.parse({
        id: row.id,
        title: row.title,
        fileName: row.fileName,
        status: row.status,
        activeVersionNumber: row.activeVersionNumber,
        latestIndexStatus: row.latestIndexStatus,
        lastIndexedAt: row.lastIndexedAt?.toISOString() ?? null,
        latestIndexError: latestJob?.lastError ?? null,
        versionCount: row.versions.length,
        bindingCount: row.bindings.length,
        summary: `文档《${row.title}》当前索引状态为 ${row.latestIndexStatus}。`,
      });
    },
  },
  get_index_failure_reason: {
    name: "get_index_failure_reason",
    title: "解释索引失败原因",
    description: "解释知识文档索引失败、排队或未完成的原因。",
    category: "inspect",
    riskLevel: "low",
    domainAgent: "KnowledgeAgent",
    resourceScopes: ["knowledge_document", "task"],
    inputSchema: knowledgeDocumentIdInputSchema,
    outputSchema: getIndexFailureReasonOutputSchema,
    execute: async (_context, rawInput) => {
      const input = knowledgeDocumentIdInputSchema.parse(rawInput);
      const row = await prisma.knowledgeDocument.findUnique({
        where: { id: input.documentId },
      });
      if (!row) {
        throw new AgentToolError("NOT_FOUND", "Knowledge document not found.");
      }
      const latestJob = await prisma.ragIndexJob.findFirst({
        where: {
          ownerType: "knowledge_document",
          ownerId: row.id,
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      });
      const failureSummary = row.latestIndexStatus === "failed"
        ? (latestJob?.lastError?.trim() || "索引任务失败，但未记录明确错误。")
        : row.latestIndexStatus === "running"
          ? "索引任务仍在执行中，并未失败。"
          : row.latestIndexStatus === "queued"
            ? "索引任务仍在排队。"
            : "当前没有索引失败记录。";
      const recoveryHint = row.latestIndexStatus === "failed"
        ? "建议检查文档内容、向量化配置和最近一次重建任务日志后再重试。"
        : row.latestIndexStatus === "queued"
          ? "建议检查索引工作线程是否正常运行。"
          : "当前无需恢复操作。";
      return getIndexFailureReasonOutputSchema.parse({
        documentId: row.id,
        status: row.latestIndexStatus,
        failureSummary,
        failureDetails: latestJob?.lastError ?? null,
        recoveryHint,
        summary: failureSummary,
      });
    },
  },
};
