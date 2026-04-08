import type {
  TaskStatus,
  UnifiedTaskDetail,
  UnifiedTaskSummary,
} from "@ai-novel/shared/types/task";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { bookAnalysisService } from "../../bookAnalysis/BookAnalysisService";
import { resolveLiveBookAnalysisStatus } from "../../bookAnalysis/bookAnalysis.status";
import {
  buildTaskRecoveryHint,
  isArchivableTaskStatus,
  normalizeFailureSummary,
  resolveStructuredFailureSummary,
} from "../taskSupport";
import {
  archiveTask as recordTaskArchive,
  getArchivedTaskIds,
  isTaskArchived,
} from "../taskArchive";
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
    const archivedIds = await getArchivedTaskIds("book_analysis");
    const rows = await prisma.bookAnalysis.findMany({
      where: {
        status: status ? status : { in: ["queued", "running", "succeeded", "failed", "cancelled"] },
        ...(archivedIds.length
          ? {
            id: {
              notIn: archivedIds,
            },
          }
          : {}),
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
      const normalizedStatus = resolveLiveBookAnalysisStatus({
        status: row.status,
        currentStage: row.currentStage,
        heartbeatAt: row.heartbeatAt,
      });
      const mappedStatus = mapBookStatusToTaskStatus(normalizedStatus);
      if (!mappedStatus) {
        continue;
      }
      const structuredFailure = resolveStructuredFailureSummary(row.lastError);
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
        failureCode: normalizedStatus === "failed"
          ? (structuredFailure.failureCode ?? "BOOK_ANALYSIS_FAILED")
          : null,
        failureSummary: normalizedStatus === "failed"
          ? (structuredFailure.failureSummary ?? normalizeFailureSummary(row.lastError, "拆书任务失败，但没有记录明确错误。"))
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
    if (await isTaskArchived("book_analysis", id)) {
      return null;
    }

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
    const normalizedStatus = resolveLiveBookAnalysisStatus({
      status: row.status,
      currentStage: row.currentStage,
      heartbeatAt: row.heartbeatAt,
    });
    const status = mapBookStatusToTaskStatus(normalizedStatus);
    if (!status) {
      return null;
    }
    const structuredFailure = resolveStructuredFailureSummary(row.lastError);
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
      failureCode: normalizedStatus === "failed"
        ? (structuredFailure.failureCode ?? "BOOK_ANALYSIS_FAILED")
        : null,
      failureSummary: normalizedStatus === "failed"
        ? (structuredFailure.failureSummary ?? normalizeFailureSummary(row.lastError, "拆书任务失败，但没有记录明确错误。"))
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
      finishedAt: normalizedStatus === "running" || normalizedStatus === "queued" ? null : row.updatedAt.toISOString(),
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
    if (await isTaskArchived("book_analysis", id)) {
      throw new AppError("Task not found.", 404);
    }

    const analysis = await bookAnalysisService.retryAnalysis(id);
    const detail = await this.detail(analysis.id);
    if (!detail) {
      throw new AppError("Task not found after retry.", 404);
    }
    return detail;
  }

  async cancel(id: string): Promise<UnifiedTaskDetail> {
    if (await isTaskArchived("book_analysis", id)) {
      throw new AppError("Task not found.", 404);
    }

    const analysis = await bookAnalysisService.cancelAnalysis(id);
    const detail = await this.detail(analysis.id);
    if (!detail) {
      throw new AppError("Task not found after cancellation.", 404);
    }
    return detail;
  }

  async archive(id: string): Promise<UnifiedTaskDetail | null> {
    if (await isTaskArchived("book_analysis", id)) {
      return null;
    }

    const analysis = await prisma.bookAnalysis.findUnique({
      where: { id },
    });
    if (!analysis) {
      throw new AppError("Task not found.", 404);
    }

    const status = mapBookStatusToTaskStatus(analysis.status);
    if (!status || !isArchivableTaskStatus(status)) {
      if (analysis.status === "archived") {
        await recordTaskArchive("book_analysis", id);
        return null;
      }
      throw new AppError("Only completed, failed, or cancelled tasks can be archived.", 400);
    }

    await bookAnalysisService.updateAnalysisStatus(id, "archived");
    await recordTaskArchive("book_analysis", id);
    return null;
  }
}
