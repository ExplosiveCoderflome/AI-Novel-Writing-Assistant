import type { TaskStatus, UnifiedTaskDetail, UnifiedTaskSummary } from "@ai-novel/shared/types/task";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { styleExtractionTaskService } from "../../styleEngine/StyleExtractionTaskService";
import { getLlmRepairSessionLogPath, getLlmSessionLogPath } from "../../../llm/sessionLogFile";
import {
  buildSteps,
  STYLE_EXTRACTION_TASK_STEPS,
  toLegacyTaskStatus,
} from "../taskCenter.shared";
import {
  buildTaskRecoveryHint,
  isArchivableTaskStatus,
  normalizeFailureSummary,
  resolveStructuredFailureSummary,
} from "../taskSupport";
import { toTaskTokenUsageSummary } from "../taskTokenUsageSummary";
import {
  archiveTask as recordTaskArchive,
  getArchivedTaskIds,
  isTaskArchived,
} from "../taskArchive";

function buildTaskTitle(name: string): string {
  return `写法提取：${name}`;
}

function parseTimeoutMs(rawValue: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(rawValue ?? "");
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const value = Math.floor(parsed);
  return Math.max(min, Math.min(max, value));
}

function resolveStyleExtractionTimeoutMs(): number {
  const globalTimeoutMs = parseTimeoutMs(
    process.env.LLM_REQUEST_TIMEOUT_MS,
    180_000,
    30_000,
    900_000,
  );
  return parseTimeoutMs(
    process.env.STYLE_EXTRACTION_LLM_TIMEOUT_MS,
    Math.max(globalTimeoutMs, 180_000),
    180_000,
    900_000,
  );
}

export class StyleExtractionTaskAdapter {
  async list(input: {
    status?: TaskStatus;
    keyword?: string;
    take: number;
  }): Promise<UnifiedTaskSummary[]> {
    if (input.status === "waiting_approval") {
      return [];
    }
    const status = toLegacyTaskStatus(input.status);
    const archivedIds = await getArchivedTaskIds("style_extraction");
    const rows = await prisma.styleExtractionTask.findMany({
      where: {
        ...(archivedIds.length ? { id: { notIn: archivedIds } } : {}),
        ...(status ? { status } : {}),
        ...(input.keyword
          ? {
              OR: [
                { name: { contains: input.keyword } },
                { category: { contains: input.keyword } },
                { createdStyleProfileName: { contains: input.keyword } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: input.take,
    });

    return rows.map((row) => {
      const structuredFailure = resolveStructuredFailureSummary(row.error);
      return {
        id: row.id,
        kind: "style_extraction",
        title: buildTaskTitle(row.name),
        status: row.status as TaskStatus,
        progress: row.progress,
        currentStage: row.currentStage,
        currentItemKey: row.currentItemKey,
        currentItemLabel: row.currentItemLabel,
        attemptCount: row.retryCount,
        maxAttempts: row.maxRetries,
        lastError: row.error,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        heartbeatAt: row.heartbeatAt?.toISOString() ?? null,
        ownerId: row.createdStyleProfileId ?? row.id,
        ownerLabel: row.createdStyleProfileName ?? row.name,
        sourceRoute: "/writing-formula",
        failureCode: row.status === "failed"
          ? (structuredFailure.failureCode ?? "STYLE_EXTRACTION_FAILED")
          : null,
        failureSummary: row.status === "failed"
          ? (structuredFailure.failureSummary ?? normalizeFailureSummary(row.error, "写法提取任务失败，但没有记录到明确错误。"))
          : row.error,
        recoveryHint: buildTaskRecoveryHint("style_extraction", row.status as TaskStatus),
        tokenUsage: toTaskTokenUsageSummary({
          promptTokens: row.promptTokens,
          completionTokens: row.completionTokens,
          totalTokens: row.totalTokens,
          llmCallCount: row.llmCallCount,
          lastTokenRecordedAt: row.lastTokenRecordedAt,
        }),
        sourceResource: {
          type: "writing_formula",
          id: row.id,
          label: row.name,
          route: "/writing-formula",
        },
        targetResources: row.createdStyleProfileId
          ? [{
              type: "writing_formula",
              id: row.createdStyleProfileId,
              label: row.createdStyleProfileName ?? row.name,
              route: `/writing-formula?profileId=${row.createdStyleProfileId}`,
            }]
          : [],
      } satisfies UnifiedTaskSummary;
    });
  }

  async detail(id: string): Promise<UnifiedTaskDetail | null> {
    if (await isTaskArchived("style_extraction", id)) {
      return null;
    }

    const row = await prisma.styleExtractionTask.findUnique({
      where: { id },
    });
    if (!row) {
      return null;
    }

    const structuredFailure = resolveStructuredFailureSummary(row.error);
    const summary: UnifiedTaskSummary = {
      id: row.id,
      kind: "style_extraction",
      title: buildTaskTitle(row.name),
      status: row.status as TaskStatus,
      progress: row.progress,
      currentStage: row.currentStage,
      currentItemKey: row.currentItemKey,
      currentItemLabel: row.currentItemLabel,
      attemptCount: row.retryCount,
      maxAttempts: row.maxRetries,
      lastError: row.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      heartbeatAt: row.heartbeatAt?.toISOString() ?? null,
      ownerId: row.createdStyleProfileId ?? row.id,
      ownerLabel: row.createdStyleProfileName ?? row.name,
      sourceRoute: "/writing-formula",
      failureCode: row.status === "failed"
        ? (structuredFailure.failureCode ?? "STYLE_EXTRACTION_FAILED")
        : null,
      failureSummary: row.status === "failed"
        ? (structuredFailure.failureSummary ?? normalizeFailureSummary(row.error, "写法提取任务失败，但没有记录到明确错误。"))
        : row.error,
      recoveryHint: buildTaskRecoveryHint("style_extraction", row.status as TaskStatus),
      tokenUsage: toTaskTokenUsageSummary({
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        totalTokens: row.totalTokens,
        llmCallCount: row.llmCallCount,
        lastTokenRecordedAt: row.lastTokenRecordedAt,
      }),
      sourceResource: {
        type: "writing_formula",
        id: row.id,
        label: row.name,
        route: "/writing-formula",
      },
      targetResources: row.createdStyleProfileId
        ? [{
            type: "writing_formula",
            id: row.createdStyleProfileId,
            label: row.createdStyleProfileName ?? row.name,
            route: `/writing-formula?profileId=${row.createdStyleProfileId}`,
          }]
        : [],
    };

    return {
      ...summary,
      provider: row.provider,
      model: row.model,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      retryCountLabel: `${row.retryCount}/${row.maxRetries}`,
      meta: {
        category: row.category,
        presetKey: row.presetKey,
        sourceTextLength: row.sourceText.length,
        summary: row.summary,
        createdStyleProfileId: row.createdStyleProfileId,
        createdStyleProfileName: row.createdStyleProfileName,
        cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
        llmTimeoutMs: resolveStyleExtractionTimeoutMs(),
        llmLogPath: getLlmSessionLogPath(),
        llmRepairLogPath: getLlmRepairSessionLogPath(),
      },
      steps: buildSteps(
        STYLE_EXTRACTION_TASK_STEPS,
        summary.status,
        summary.currentStage,
        summary.createdAt,
        summary.updatedAt,
      ),
      failureDetails: row.error,
    };
  }

  async retry(id: string): Promise<UnifiedTaskDetail> {
    if (await isTaskArchived("style_extraction", id)) {
      throw new AppError("Task not found.", 404);
    }

    const task = await styleExtractionTaskService.retryTask(id);
    const detail = await this.detail(task.id);
    if (!detail) {
      throw new AppError("Task not found after retry.", 404);
    }
    return detail;
  }

  async cancel(id: string): Promise<UnifiedTaskDetail> {
    if (await isTaskArchived("style_extraction", id)) {
      throw new AppError("Task not found.", 404);
    }

    const task = await styleExtractionTaskService.cancelTask(id);
    const detail = await this.detail(task.id);
    if (!detail) {
      throw new AppError("Task not found after cancellation.", 404);
    }
    return detail;
  }

  async archive(id: string): Promise<UnifiedTaskDetail | null> {
    if (await isTaskArchived("style_extraction", id)) {
      return null;
    }

    const task = await prisma.styleExtractionTask.findUnique({
      where: { id },
    });
    if (!task) {
      throw new AppError("Task not found.", 404);
    }
    if (!isArchivableTaskStatus(task.status as TaskStatus)) {
      throw new AppError("Only completed, failed, or cancelled tasks can be archived.", 400);
    }

    await recordTaskArchive("style_extraction", id);
    return null;
  }
}
