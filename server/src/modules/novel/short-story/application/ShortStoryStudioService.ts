import { shortStoryReferenceService, parseShortStoryReference } from "../../creation-studio/reference";
import { latestStructuredDiagnostic, canRetryStructuredTask } from "../../../../platform/llm/diagnostics/StructuredDiagnosticStore";
import type {
  CreationIntentInterpretation,
  ShortStoryProjection,
  ShortStoryRevisionImpact,
  ShortStorySegmentUpdateRequest,
} from "@ai-novel/shared/types/creationStudio";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { shortStoryProductionService } from "./ShortStoryProductionService";

import { isLegacyRevision, parseJson, appendSnapshot } from "../domain/revisionState";
import { shortStoryRevisionService } from "./ShortStoryRevisionService";
import { previewShortStoryRevision } from "./ShortStoryRevisionPreviewService";

function wordCount(content: string): number {
  return content.replace(/\s+/g, "").length;
}

export class ShortStoryStudioService {
  async getProjection(novelId: string): Promise<ShortStoryProjection> {
    const { novel, job } = await prisma.$transaction(async (tx) => {
      const novel = await tx.novel.findUnique({
        where: { id: novelId },
        include: {
          shortStoryPlan: {
            include: { segments: { orderBy: { order: "asc" } } },
          },
          intentVersions: {
            where: { status: "active" },
            orderBy: { version: "desc" },
            take: 1,
          },
          workflowTasks: {
            where: { lane: "creation_studio" },
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
        },
      });
      const operationId = novel?.workflowTasks[0]?.shortStoryOperationId;
      const job = operationId ? await tx.shortStoryRevisionJob.findUnique({ where: { id: operationId } }) : null;
      return { novel, job };
    }, { isolationLevel: "Serializable" });
    if (!novel || novel.narrativeForm !== "short_story") {
      throw new AppError("短篇作品不存在。", 404);
    }
    const intentRow = novel.intentVersions[0] ?? null;
    const interpretation = intentRow
      ? parseJson<CreationIntentInterpretation | null>(intentRow.structuredIntentJson, null)
      : null;
    const selected = intentRow
      ? parseJson<{ selectedDirectionId?: string }>(intentRow.impactScopeJson, {})
      : {};
    const direction = interpretation?.directions.find((item) => item.id === selected.selectedDirectionId) ?? null;
    const plan = novel.shortStoryPlan;
    const task = novel.workflowTasks[0] ?? null;
    const legacyRevision = Boolean(task && !job && isLegacyRevision(task, intentRow?.source));
    const recoveryAction = task?.checkpointType === "replan_required" ? "preview_replan"
      : (job?.status === "conflict" || (legacyRevision && task?.status !== "succeeded")) ? "preview_revision"
      : task?.status === "failed" || task?.status === "cancelled" ? (job ? "retry_revision" : "retry_generation")
      : null;
    return {
      reference: await shortStoryReferenceService.view(parseShortStoryReference(novel.shortStoryReferenceJson, Boolean(novel.referenceBookAnalysisId))),
      novel: {
        id: novel.id,
        title: novel.title,
        narrativeForm: novel.narrativeForm,
        targetWordCount: novel.targetWordCount ?? plan?.targetWordCount ?? 0,
        derivedFromNovelId: novel.derivedFromNovelId,
        writingPlatform: novel.writingPlatform as ShortStoryProjection["novel"]["writingPlatform"],
        writingPlatformProfileVersion: novel.writingPlatformProfileVersion,
      },
      intent: intentRow && interpretation && direction ? {
        id: intentRow.id,
        version: intentRow.version,
        originalExpression: intentRow.originalExpression,
        understanding: interpretation.understanding,
        direction,
      } : null,
      plan: plan ? {
        id: plan.id,
        status: plan.status as ShortStoryProjection["plan"] extends infer P
          ? P extends { status: infer S } ? S : never
          : never,
        endingPromise: plan.endingPromise,
        qualityDebt: parseJson<string[]>(plan.qualityDebtJson, []),
        schemaVersion: plan.schemaVersion,
      } : null,
      segments: (plan?.segments ?? []).map((segment) => ({
        id: segment.id,
        order: segment.order,
        content: segment.content,
        status: segment.status as "pending" | "generating" | "completed" | "failed",
        version: segment.version,
        targetWordCount: segment.targetWordCount,
        wordCount: wordCount(segment.content),
        humanEdited: Boolean(segment.userEditedAt),
        qualityResult: parseJson(segment.qualityResultJson, null),
        updatedAt: segment.updatedAt.toISOString(),
      })),
      continuousContent: (plan?.segments ?? [])
        .map((segment) => segment.content.trim())
        .filter(Boolean)
        .join("\n\n"),
      production: {
        taskId: task?.id ?? null,
        status: task?.status ?? null,
        progress: task?.progress ?? 0,
        currentAction: task?.currentItemLabel ?? null,
        error: task?.lastError ?? null,
        diagnostic: task && task.status !== "running" && task.status !== "queued" ? await latestStructuredDiagnostic(task.id, task.status === "failed") : null,
        checkpointType: task?.checkpointType ?? null,
        checkpointSummary: task?.checkpointSummary ?? null,
        recoveryAction,
        revisionJob: job ? { id: job.id, status: job.status, strategy: job.strategy } : null,
      },
    };
  }

  async retryProduction(novelId: string): Promise<{ taskId: string }> {
    const task = await prisma.novelWorkflowTask.findFirst({
      where: {
        novelId,
        lane: "creation_studio",
      },
      orderBy: { updatedAt: "desc" },
    });
    if (!task) {
      throw new AppError("没有可继续的短篇生成任务。", 404);
    }
    if (task.checkpointType === "replan_required") {
      throw new AppError("这篇作品需要先确认新的创作方向。", 409);
    }
    if (!await canRetryStructuredTask(task.id)) throw new AppError("模型服务要求稍后再试，请等待后继续。", 429);
    if (task.shortStoryOperationId) {
      await shortStoryRevisionService.retry(task.shortStoryOperationId);
      shortStoryProductionService.schedule(task.id);
      return { taskId: task.id };
    }
    const active = await prisma.novelIntentVersion.findFirst({ where: { workflowTaskId: task.id, status: "active" }, orderBy: { version: "desc" } });
    if (isLegacyRevision(task, active?.source)) throw new AppError("请重新预览并确认修改，已保存的正文和快照会保留。", 409);
    if (task.status !== "failed" && task.status !== "cancelled") {
      throw new AppError("当前生成任务不需要重试。", 409);
    }
    await prisma.novelWorkflowTask.updateMany({
      where: { id: task.id, status: task.status, checkpointType: task.checkpointType },
      data: { status: "queued", checkpointType: null, checkpointSummary: null,
        pendingManualRecovery: false, cancelRequestedAt: null, finishedAt: null, lastError: null,
        attemptCount: { increment: 1 }, heartbeatAt: new Date() },
    });
    shortStoryProductionService.schedule(task.id);
    return { taskId: task.id };
  }

  async updateSegment(
    novelId: string,
    segmentId: string,
    input: ShortStorySegmentUpdateRequest,
  ) {
    const segment = await prisma.shortStorySegment.findFirst({
      where: { id: segmentId, novelId },
    });
    if (!segment) {
      throw new AppError("要保存的正文片段不存在。", 404);
    }
    const content = input.content.trim();
    if (!content) {
      throw new AppError("正文不能为空。", 400);
    }
    const updated = await prisma.shortStorySegment.updateMany({
      where: { id: segment.id, version: input.expectedVersion },
      data: {
        content,
        version: { increment: 1 },
        status: "completed",
        humanSnapshotJson: appendSnapshot(segment.humanSnapshotJson, segment.content, segment.version),
        userEditedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      throw new AppError("正文已在其他位置更新，请刷新后再保存。", 409);
    }
    return prisma.shortStorySegment.findUniqueOrThrow({ where: { id: segment.id } });
  }

  previewRevision = previewShortStoryRevision;

  async applyRevision(novelId: string, intentVersionId: string): Promise<{ taskId: string }> {
    const result = await shortStoryRevisionService.confirm(novelId, intentVersionId);
    shortStoryProductionService.schedule(result.taskId);
    return result;
  }
}

export const shortStoryStudioService = new ShortStoryStudioService();
