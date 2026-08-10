import type { NovelProductionExperienceSelectionResponse } from "@ai-novel/shared/types/novelWorkflow";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import {
  buildNovelEditResumeTarget,
  parseSeedPayload,
} from "../../workflow/novelWorkflow.shared";
import type { DirectorWorkflowSeedPayload } from "../runtime/novelDirectorHelpers";
import { DirectorCommandService } from "./DirectorCommandService";
import { buildProductionExperienceSeed } from "./DirectorProductionExperienceService";

interface SimpleCreationChapterFact {
  id?: string;
  order: number;
  content?: string | null;
}

export interface SimpleCreationRemainingRange {
  startOrder: number;
  endOrder: number;
  totalChapterCount: number;
  savedChapterCount: number;
  remainingChapterCount: number;
  nextChapterId: string | null;
}

export function resolveSimpleCreationRemainingRange(input: {
  chapters: SimpleCreationChapterFact[];
  estimatedChapterCount?: number | null;
}): SimpleCreationRemainingRange | null {
  const maxChapterOrder = input.chapters.reduce(
    (maximum, chapter) => Math.max(maximum, Math.round(chapter.order)),
    0,
  );
  const totalChapterCount = Math.max(
    maxChapterOrder,
    Math.round(input.estimatedChapterCount ?? 0),
  );
  if (totalChapterCount <= 0) return null;

  const savedOrders = new Set(
    input.chapters
      .filter((chapter) => chapter.content?.trim())
      .map((chapter) => Math.round(chapter.order)),
  );
  const startOrder = Array.from(
    { length: totalChapterCount },
    (_item, index) => index + 1,
  ).find((order) => !savedOrders.has(order));
  if (!startOrder) return null;

  return {
    startOrder,
    endOrder: totalChapterCount,
    totalChapterCount,
    savedChapterCount: savedOrders.size,
    remainingChapterCount: totalChapterCount - savedOrders.size,
    nextChapterId: input.chapters.find((chapter) => chapter.order === startOrder)?.id ?? null,
  };
}

export function buildSimpleCreationContinuationSeed(input: {
  seed: DirectorWorkflowSeedPayload;
  novelId: string;
  taskId: string;
  nextChapterId?: string | null;
}): DirectorWorkflowSeedPayload {
  const nextSeed = buildProductionExperienceSeed(input.seed, "simple");
  delete nextSeed.autoExecution;
  nextSeed.resumeTarget = buildNovelEditResumeTarget({
    novelId: input.novelId,
    taskId: input.taskId,
    stage: "pipeline",
    chapterId: input.nextChapterId ?? null,
  });
  return nextSeed;
}

export class SimpleCreationProductionService {
  constructor(private readonly commandService = new DirectorCommandService()) {}

  async continue(taskId: string): Promise<NovelProductionExperienceSelectionResponse> {
    const task = await prisma.novelWorkflowTask.findUnique({ where: { id: taskId } });
    if (!task || task.lane !== "auto_director") {
      throw new AppError("自动导演任务不存在。", 404);
    }
    if (!task.novelId) {
      throw new AppError("自动导演任务还没有绑定小说项目。", 409);
    }

    const novel = await prisma.novel.findUnique({
      where: { id: task.novelId },
      select: {
        creationExperience: true,
        estimatedChapterCount: true,
        chapters: {
          orderBy: { order: "asc" },
          select: { id: true, order: true, content: true },
        },
      },
    });
    if (!novel) {
      throw new AppError("小说不存在。", 404);
    }
    if (novel.creationExperience !== "simple") {
      throw new AppError("仅简易创作项目可以从章节书架继续生成。", 409);
    }
    if (task.status !== "succeeded") {
      throw new AppError("AI 任务状态已变化，请刷新页面查看最新进度。", 409);
    }

    const range = resolveSimpleCreationRemainingRange({
      chapters: novel.chapters,
      estimatedChapterCount: novel.estimatedChapterCount,
    });
    if (!range) {
      throw new AppError("目标章节均已有正文，无需继续生成。", 409);
    }

    const seed = parseSeedPayload<DirectorWorkflowSeedPayload>(task.seedPayloadJson) ?? {};
    const nextSeed = buildSimpleCreationContinuationSeed({
      seed,
      novelId: task.novelId,
      taskId: task.id,
      nextChapterId: range.nextChapterId,
    });
    const rangeLabel = range.startOrder === range.endOrder
      ? `第 ${range.startOrder} 章`
      : `第 ${range.startOrder}-${range.endOrder} 章`;
    const claimed = await prisma.novelWorkflowTask.updateMany({
      where: { id: task.id, status: "succeeded" },
      data: {
        seedPayloadJson: JSON.stringify(nextSeed),
        status: "queued",
        progress: 0.9,
        currentStage: "chapter_execution",
        currentItemKey: "chapter_batch_ready",
        currentItemLabel: `${rangeLabel}正在排队`,
        checkpointType: "chapter_batch_ready",
        checkpointSummary: "后续章节范围已确认，AI 将继续写作、审校和修复。",
        pendingManualRecovery: false,
        lastError: null,
        finishedAt: null,
        cancelRequestedAt: null,
        heartbeatAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new AppError("AI 任务状态已变化，请刷新页面查看最新进度。", 409);
    }

    try {
      const command = await this.commandService.enqueueContinueCommand(task.id, {
        continuationMode: "auto_execute_range",
        forceResume: true,
      });
      return {
        experience: "simple",
        workflowTaskId: task.id,
        novelId: task.novelId,
        targetRoute: `/novels/${task.novelId}/simple`,
        backgroundStarted: true,
        commandId: command.commandId,
      };
    } catch (error) {
      await prisma.novelWorkflowTask.updateMany({
        where: {
          id: task.id,
          status: "queued",
          currentItemKey: "chapter_batch_ready",
        },
        data: {
          status: "failed",
          pendingManualRecovery: true,
          lastError: error instanceof Error ? error.message : "后续章节排队失败。",
          finishedAt: new Date(),
        },
      }).catch(() => null);
      throw error;
    }
  }
}
