import type {
  TaskStatus,
  UnifiedTaskDetail,
  UnifiedTaskSummary,
} from "@ai-novel/shared/types/task";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { bookAnalysisService } from "../../bookAnalysis/BookAnalysisService";
import { buildTaskRecoveryHint, normalizeFailureSummary } from "../taskSupport";
import {
  BOOK_ANALYSIS_STEPS,
  buildSteps,
  mapBookStatusToTaskStatus,
  toLegacyTaskStatus,
} from "../taskCenter.shared";

export class BookTaskAdapter {
  async list(input: {
    status?: TaskStatus;
    keyword?: string;
    take: number;
  }): Promise<UnifiedTaskSummary[]> {
    if (input.status === "waiting_approval") {
      return [];
    }
    const status = toLegacyTaskStatus(input.status);
    const rows = await prisma.bookAnalysis.findMany({
      where: {
        status: status ? status : { in: ["queued", "running", "succeeded", "failed", "cancelled"] },
        ...(input.keyword
          ? {
            OR: [
              { title: { contains: input.keyword } },
              { document: { title: { contains: input.keyword } } },
            ],
          }
          : {}),
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
      take: input.take,
    });

    const summaries: UnifiedTaskSummary[] = [];
    for (const row of rows) {
      const mappedStatus = mapBookStatusToTaskStatus(row.status);
      if (!mappedStatus) {
        continue;
      }
      summaries.push({
        id: row.id,
        kind: "book_analysis",
        title: row.title,
        status: mappedStatus,
        progress: row.progress,
        currentStage: row.currentStage,
        currentItemLabel: row.currentItemLabel,
        attemptCount: row.attemptCount,
        maxAttempts: row.maxAttempts,
        lastError: row.lastError,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        heartbeatAt: row.heartbeatAt?.toISOString() ?? null,
        ownerId: row.documentId,
        ownerLabel: row.document.title,
        sourceRoute: `/book-analysis?analysisId=${row.id}&documentId=${row.documentId}`,
        failureCode: row.status === "failed" ? "BOOK_ANALYSIS_FAILED" : null,
        failureSummary: row.status === "failed"
          ? normalizeFailureSummary(row.lastError, "拆书任务失败，但没有记录明确错误。")
          : row.lastError,
        recoveryHint: buildTaskRecoveryHint("book_analysis", mappedStatus),
        sourceResource: {
          type: "knowledge_document",
          id: row.documentId,
          label: row.document.title,
          route: `/knowledge?id=${row.documentId}`,
        },
        targetResources: [{
          type: "book_analysis",
          id: row.id,
          label: row.title,
          route: `/book-analysis?analysisId=${row.id}&documentId=${row.documentId}`,
        }],
      });
    }
    return summaries;
  }

  async detail(id: string): Promise<UnifiedTaskDetail | null> {
    const row = await prisma.bookAnalysis.findUnique({
      where: { id },
      include: {
        document: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
    if (!row) {
      return null;
    }
    const status = mapBookStatusToTaskStatus(row.status);
    if (!status) {
      return null;
    }
    const summary: UnifiedTaskSummary = {
      id: row.id,
      kind: "book_analysis",
      title: row.title,
      status,
      progress: row.progress,
      currentStage: row.currentStage,
      currentItemLabel: row.currentItemLabel,
      attemptCount: row.attemptCount,
      maxAttempts: row.maxAttempts,
      lastError: row.lastError,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      heartbeatAt: row.heartbeatAt?.toISOString() ?? null,
      ownerId: row.documentId,
      ownerLabel: row.document.title,
      sourceRoute: `/book-analysis?analysisId=${row.id}&documentId=${row.documentId}`,
      failureCode: row.status === "failed" ? "BOOK_ANALYSIS_FAILED" : null,
      failureSummary: row.status === "failed"
        ? normalizeFailureSummary(row.lastError, "拆书任务失败，但没有记录明确错误。")
        : row.lastError,
      recoveryHint: buildTaskRecoveryHint("book_analysis", status),
      sourceResource: {
        type: "knowledge_document",
        id: row.documentId,
        label: row.document.title,
        route: `/knowledge?id=${row.documentId}`,
      },
      targetResources: [{
        type: "book_analysis",
        id: row.id,
        label: row.title,
        route: `/book-analysis?analysisId=${row.id}&documentId=${row.documentId}`,
      }],
    };
    return {
      ...summary,
      provider: row.provider,
      model: row.model,
      startedAt: row.lastRunAt?.toISOString() ?? null,
      finishedAt: row.status === "running" || row.status === "queued" ? null : row.updatedAt.toISOString(),
      retryCountLabel: `${row.attemptCount}/${row.maxAttempts}`,
      meta: {
        documentId: row.documentId,
        documentVersionId: row.documentVersionId,
        cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
      },
      steps: buildSteps(
        BOOK_ANALYSIS_STEPS,
        summary.status,
        summary.currentStage,
        summary.createdAt,
        summary.updatedAt,
      ),
      failureDetails: row.lastError,
    };
  }

  async retry(id: string): Promise<UnifiedTaskDetail> {
    const analysis = await bookAnalysisService.retryAnalysis(id);
    const detail = await this.detail(analysis.id);
    if (!detail) {
      throw new AppError("Task not found after retry.", 404);
    }
    return detail;
  }

  async cancel(id: string): Promise<UnifiedTaskDetail> {
    const analysis = await bookAnalysisService.cancelAnalysis(id);
    const detail = await this.detail(analysis.id);
    if (!detail) {
      throw new AppError("Task not found after cancellation.", 404);
    }
    return detail;
  }
}
