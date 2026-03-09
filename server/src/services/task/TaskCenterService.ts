import type {
  TaskKind,
  TaskStatus,
  UnifiedTaskDetail,
  UnifiedTaskListResponse,
  UnifiedTaskStep,
  UnifiedTaskSummary,
} from "@ai-novel/shared/types/task";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { bookAnalysisService } from "../bookAnalysis/BookAnalysisService";
import { imageGenerationService } from "../image/ImageGenerationService";
import { NovelService } from "../novel/NovelService";

interface ListTasksFilters {
  kind?: TaskKind;
  status?: TaskStatus;
  keyword?: string;
  limit?: number;
  cursor?: string;
}

interface CursorPayload {
  status: TaskStatus;
  updatedAt: string;
  id: string;
}

const ACTIVE_TASK_STATUSES: TaskStatus[] = ["queued", "running", "succeeded", "failed", "cancelled"];
const STATUS_RANK: Record<TaskStatus, number> = {
  running: 0,
  queued: 1,
  failed: 2,
  cancelled: 3,
  succeeded: 4,
};

const BOOK_ANALYSIS_STEPS = [
  { key: "queued", label: "排队" },
  { key: "preparing_notes", label: "提取笔记" },
  { key: "generating_sections", label: "生成章节" },
  { key: "finalizing", label: "收尾" },
] as const;

const NOVEL_PIPELINE_STEPS = [
  { key: "queued", label: "排队" },
  { key: "generating_chapters", label: "生成章节" },
  { key: "reviewing", label: "审校" },
  { key: "repairing", label: "修复" },
  { key: "finalizing", label: "收尾" },
] as const;

const IMAGE_TASK_STEPS = [
  { key: "queued", label: "排队" },
  { key: "submitting", label: "提交请求" },
  { key: "generating", label: "生成图片" },
  { key: "saving_assets", label: "保存素材" },
  { key: "finalizing", label: "收尾" },
] as const;

function normalizeKeyword(value: string | undefined): string | undefined {
  const keyword = value?.trim();
  return keyword ? keyword : undefined;
}

function normalizeLimit(value: number | undefined): number {
  if (!value || Number.isNaN(value)) {
    return 30;
  }
  return Math.max(1, Math.min(100, Math.floor(value)));
}

function statusRank(status: TaskStatus): number {
  return STATUS_RANK[status] ?? 99;
}

function toCursor(summary: UnifiedTaskSummary): string {
  const payload: CursorPayload = {
    status: summary.status,
    updatedAt: summary.updatedAt,
    id: summary.id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function parseCursor(cursor: string | undefined): CursorPayload | null {
  if (!cursor?.trim()) {
    return null;
  }
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as CursorPayload;
    if (!parsed?.status || !parsed.updatedAt || !parsed.id) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function compareTaskSummary(left: UnifiedTaskSummary, right: UnifiedTaskSummary): number {
  const leftRank = statusRank(left.status);
  const rightRank = statusRank(right.status);
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  if (left.updatedAt !== right.updatedAt) {
    return right.updatedAt.localeCompare(left.updatedAt);
  }
  return right.id.localeCompare(left.id);
}

function isAfterCursor(summary: UnifiedTaskSummary, cursor: CursorPayload): boolean {
  const rankDiff = statusRank(summary.status) - statusRank(cursor.status);
  if (rankDiff !== 0) {
    return rankDiff > 0;
  }
  if (summary.updatedAt !== cursor.updatedAt) {
    return summary.updatedAt < cursor.updatedAt;
  }
  return summary.id < cursor.id;
}

function resolveStageIndex(
  definitions: ReadonlyArray<{ key: string; label: string }>,
  currentStage: string | null | undefined,
): number {
  if (!currentStage) {
    return 0;
  }
  const index = definitions.findIndex((item) => item.key === currentStage);
  return index >= 0 ? index : 0;
}

function buildSteps(
  definitions: ReadonlyArray<{ key: string; label: string }>,
  status: TaskStatus,
  currentStage: string | null | undefined,
  createdAt: string,
  updatedAt: string,
): UnifiedTaskStep[] {
  const stageIndex = resolveStageIndex(definitions, currentStage);
  return definitions.map((item, index) => {
    let stepStatus: UnifiedTaskStep["status"] = "idle";
    if (status === "queued") {
      stepStatus = index === 0 ? "running" : "idle";
    } else if (status === "running") {
      if (index < stageIndex) {
        stepStatus = "succeeded";
      } else if (index === stageIndex) {
        stepStatus = "running";
      }
    } else if (status === "succeeded") {
      stepStatus = "succeeded";
    } else if (status === "failed") {
      if (index < stageIndex) {
        stepStatus = "succeeded";
      } else if (index === stageIndex) {
        stepStatus = "failed";
      }
    } else if (status === "cancelled") {
      if (index < stageIndex) {
        stepStatus = "succeeded";
      } else if (index === stageIndex) {
        stepStatus = "cancelled";
      }
    }

    return {
      key: item.key,
      label: item.label,
      status: stepStatus,
      startedAt: stepStatus === "idle" ? null : createdAt,
      updatedAt: stepStatus === "idle" ? null : updatedAt,
    };
  });
}

function mapBookStatusToTaskStatus(status: string): TaskStatus | null {
  if (status === "queued" || status === "running" || status === "succeeded" || status === "failed" || status === "cancelled") {
    return status;
  }
  return null;
}

export class TaskCenterService {
  private readonly novelService = new NovelService();

  async listTasks(filters: ListTasksFilters = {}): Promise<UnifiedTaskListResponse> {
    const limit = normalizeLimit(filters.limit);
    const sourceTake = Math.max(60, limit * 4);
    const keyword = normalizeKeyword(filters.keyword);
    const cursorPayload = parseCursor(filters.cursor);

    const [bookTasks, novelTasks, imageTasks] = await Promise.all([
      filters.kind && filters.kind !== "book_analysis"
        ? Promise.resolve<UnifiedTaskSummary[]>([])
        : this.listBookAnalysisTasks({ status: filters.status, keyword, take: sourceTake }),
      filters.kind && filters.kind !== "novel_pipeline"
        ? Promise.resolve<UnifiedTaskSummary[]>([])
        : this.listNovelPipelineTasks({ status: filters.status, keyword, take: sourceTake }),
      filters.kind && filters.kind !== "image_generation"
        ? Promise.resolve<UnifiedTaskSummary[]>([])
        : this.listImageTasks({ status: filters.status, keyword, take: sourceTake }),
    ]);

    const merged = [...bookTasks, ...novelTasks, ...imageTasks].sort(compareTaskSummary);
    const filteredByCursor = cursorPayload
      ? merged.filter((item) => isAfterCursor(item, cursorPayload))
      : merged;
    const items = filteredByCursor.slice(0, limit);
    const nextCursor = filteredByCursor.length > limit ? toCursor(items[items.length - 1]) : null;

    return {
      items,
      nextCursor,
    };
  }

  async getTaskDetail(kind: TaskKind, id: string): Promise<UnifiedTaskDetail | null> {
    if (kind === "book_analysis") {
      return this.getBookAnalysisTaskDetail(id);
    }
    if (kind === "novel_pipeline") {
      return this.getNovelPipelineTaskDetail(id);
    }
    return this.getImageTaskDetail(id);
  }

  async retryTask(kind: TaskKind, id: string): Promise<UnifiedTaskDetail> {
    if (kind === "book_analysis") {
      const analysis = await bookAnalysisService.retryAnalysis(id);
      const detail = await this.getBookAnalysisTaskDetail(analysis.id);
      if (!detail) {
        throw new AppError("Task not found after retry.", 404);
      }
      return detail;
    }
    if (kind === "novel_pipeline") {
      const job = await this.novelService.retryPipelineJob(id);
      const detail = await this.getNovelPipelineTaskDetail(job.id);
      if (!detail) {
        throw new AppError("Task not found after retry.", 404);
      }
      return detail;
    }
    const task = await imageGenerationService.retryTask(id);
    const detail = await this.getImageTaskDetail(task.id);
    if (!detail) {
      throw new AppError("Task not found after retry.", 404);
    }
    return detail;
  }

  async cancelTask(kind: TaskKind, id: string): Promise<UnifiedTaskDetail> {
    if (kind === "book_analysis") {
      const analysis = await bookAnalysisService.cancelAnalysis(id);
      const detail = await this.getBookAnalysisTaskDetail(analysis.id);
      if (!detail) {
        throw new AppError("Task not found after cancellation.", 404);
      }
      return detail;
    }
    if (kind === "novel_pipeline") {
      const job = await this.novelService.cancelPipelineJob(id);
      const detail = await this.getNovelPipelineTaskDetail(job.id);
      if (!detail) {
        throw new AppError("Task not found after cancellation.", 404);
      }
      return detail;
    }
    const task = await imageGenerationService.cancelTask(id);
    const detail = await this.getImageTaskDetail(task.id);
    if (!detail) {
      throw new AppError("Task not found after cancellation.", 404);
    }
    return detail;
  }

  private async listBookAnalysisTasks(input: {
    status?: TaskStatus;
    keyword?: string;
    take: number;
  }): Promise<UnifiedTaskSummary[]> {
    const rows = await prisma.bookAnalysis.findMany({
      where: {
        status: input.status ? input.status : { in: ACTIVE_TASK_STATUSES },
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
      });
    }
    return summaries;
  }

  private async listNovelPipelineTasks(input: {
    status?: TaskStatus;
    keyword?: string;
    take: number;
  }): Promise<UnifiedTaskSummary[]> {
    const rows = await prisma.generationJob.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.keyword
          ? {
              OR: [
                { novel: { title: { contains: input.keyword } } },
                { id: { contains: input.keyword } },
              ],
            }
          : {}),
      },
      include: {
        novel: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: input.take,
    });

    return rows.map((row) => ({
      id: row.id,
      kind: "novel_pipeline",
      title: `${row.novel.title} (${row.startOrder}-${row.endOrder}章)`,
      status: row.status as TaskStatus,
      progress: row.progress,
      currentStage: row.currentStage,
      currentItemLabel: row.currentItemLabel,
      attemptCount: row.retryCount,
      maxAttempts: row.maxRetries,
      lastError: row.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      heartbeatAt: row.heartbeatAt?.toISOString() ?? null,
      ownerId: row.novelId,
      ownerLabel: row.novel.title,
      sourceRoute: `/novels/${row.novelId}/edit`,
    }));
  }

  private async listImageTasks(input: {
    status?: TaskStatus;
    keyword?: string;
    take: number;
  }): Promise<UnifiedTaskSummary[]> {
    const rows = await prisma.imageGenerationTask.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.keyword
          ? {
              OR: [
                { prompt: { contains: input.keyword } },
                { baseCharacter: { name: { contains: input.keyword } } },
              ],
            }
          : {}),
      },
      include: {
        baseCharacter: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: input.take,
    });

    return rows.map((row) => ({
      id: row.id,
      kind: "image_generation",
      title: row.baseCharacter?.name ? `角色图像：${row.baseCharacter.name}` : `图像任务 ${row.id.slice(0, 8)}`,
      status: row.status as TaskStatus,
      progress: row.progress,
      currentStage: row.currentStage,
      currentItemLabel: row.currentItemLabel,
      attemptCount: row.retryCount,
      maxAttempts: row.maxRetries,
      lastError: row.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      heartbeatAt: row.heartbeatAt?.toISOString() ?? null,
      ownerId: row.baseCharacterId ?? row.id,
      ownerLabel: row.baseCharacter?.name ?? "未关联角色",
      sourceRoute: row.baseCharacterId ? `/base-characters?id=${row.baseCharacterId}` : "/base-characters",
    }));
  }

  private async getBookAnalysisTaskDetail(id: string): Promise<UnifiedTaskDetail | null> {
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
    };
  }

  private async getNovelPipelineTaskDetail(id: string): Promise<UnifiedTaskDetail | null> {
    const row = await prisma.generationJob.findUnique({
      where: { id },
      include: {
        novel: {
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

    const summary: UnifiedTaskSummary = {
      id: row.id,
      kind: "novel_pipeline",
      title: `${row.novel.title} (${row.startOrder}-${row.endOrder}章)`,
      status: row.status as TaskStatus,
      progress: row.progress,
      currentStage: row.currentStage,
      currentItemLabel: row.currentItemLabel,
      attemptCount: row.retryCount,
      maxAttempts: row.maxRetries,
      lastError: row.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      heartbeatAt: row.heartbeatAt?.toISOString() ?? null,
      ownerId: row.novelId,
      ownerLabel: row.novel.title,
      sourceRoute: `/novels/${row.novelId}/edit`,
    };

    let payload: Record<string, unknown> = {};
    if (row.payload?.trim()) {
      try {
        payload = JSON.parse(row.payload) as Record<string, unknown>;
      } catch {
        payload = { rawPayload: row.payload };
      }
    }

    return {
      ...summary,
      provider: typeof payload.provider === "string" ? payload.provider : null,
      model: typeof payload.model === "string" ? payload.model : null,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      retryCountLabel: `${row.retryCount}/${row.maxRetries}`,
      meta: {
        novelId: row.novelId,
        startOrder: row.startOrder,
        endOrder: row.endOrder,
        totalCount: row.totalCount,
        completedCount: row.completedCount,
        cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
        payload,
      },
      steps: buildSteps(
        NOVEL_PIPELINE_STEPS,
        summary.status,
        summary.currentStage,
        summary.createdAt,
        summary.updatedAt,
      ),
    };
  }

  private async getImageTaskDetail(id: string): Promise<UnifiedTaskDetail | null> {
    const row = await prisma.imageGenerationTask.findUnique({
      where: { id },
      include: {
        baseCharacter: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    if (!row) {
      return null;
    }

    const summary: UnifiedTaskSummary = {
      id: row.id,
      kind: "image_generation",
      title: row.baseCharacter?.name ? `角色图像：${row.baseCharacter.name}` : `图像任务 ${row.id.slice(0, 8)}`,
      status: row.status as TaskStatus,
      progress: row.progress,
      currentStage: row.currentStage,
      currentItemLabel: row.currentItemLabel,
      attemptCount: row.retryCount,
      maxAttempts: row.maxRetries,
      lastError: row.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      heartbeatAt: row.heartbeatAt?.toISOString() ?? null,
      ownerId: row.baseCharacterId ?? row.id,
      ownerLabel: row.baseCharacter?.name ?? "未关联角色",
      sourceRoute: row.baseCharacterId ? `/base-characters?id=${row.baseCharacterId}` : "/base-characters",
    };

    return {
      ...summary,
      provider: row.provider,
      model: row.model,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      retryCountLabel: `${row.retryCount}/${row.maxRetries}`,
      meta: {
        sceneType: row.sceneType,
        baseCharacterId: row.baseCharacterId,
        prompt: row.prompt,
        negativePrompt: row.negativePrompt,
        size: row.size,
        imageCount: row.imageCount,
        cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
      },
      steps: buildSteps(
        IMAGE_TASK_STEPS,
        summary.status,
        summary.currentStage,
        summary.createdAt,
        summary.updatedAt,
      ),
    };
  }
}

export const taskCenterService = new TaskCenterService();
