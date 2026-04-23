import { Prisma } from "@prisma/client";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  StyleExtractionDraft,
  StyleExtractionSourceProcessingMode,
  StyleFeatureDecision,
} from "@ai-novel/shared/types/styleEngine";
import { prisma } from "../../db/prisma";
import { runWithLlmUsageTracking } from "../../llm/usageTracking";
import { AppError } from "../../middleware/errorHandler";
import { getStyleEngineRuntimeSettings } from "../settings/StyleEngineRuntimeSettingsService";
import {
  buildStyleExtractionSourceInput,
  resolveStyleExtractionInputText,
  resolveTaskProfileSource,
  type StyleExtractionTaskSourceType,
} from "./StyleExtractionSourceInput";
import { StyleProfileService } from "./StyleProfileService";

type PresetKey = "imitate" | "balanced" | "transfer";

interface CreateStyleExtractionTaskInput {
  name: string;
  sourceText: string;
  sourceType?: StyleExtractionTaskSourceType;
  sourceRefId?: string;
  sourceProcessingMode?: StyleExtractionSourceProcessingMode;
  category?: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  presetKey?: PresetKey;
  maxRetries?: number;
}

function parseTimeoutMs(rawValue: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(rawValue ?? "");
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const value = Math.floor(parsed);
  return Math.max(min, Math.min(max, value));
}

const STYLE_EXTRACTION_HEARTBEAT_INTERVAL_MS = parseTimeoutMs(
  process.env.STYLE_EXTRACTION_TASK_HEARTBEAT_INTERVAL_MS,
  10_000,
  5_000,
  60_000,
);

function stripStructuredOutputPrefix(message: string): string {
  return message.replace(/^\[STRUCTURED_OUTPUT:[a-z_]+\]\s*/iu, "").trim();
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const haystack = `${error.name} ${error.message}`.toLowerCase();
  return error.name === "TimeoutError" || /timed out|timeout|超时/u.test(haystack);
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const haystack = `${error.name} ${error.message}`.toLowerCase();
  return error.name === "AbortError" || /aborted|abort|中止/u.test(haystack);
}

function normalizeTaskError(error: unknown): string {
  if (isTimeoutError(error)) {
    return "写法提取请求超时，模型长时间没有返回结果。可以在系统设置调高写法提取超时后重试，或切换更稳定的模型。";
  }
  if (isAbortError(error)) {
    return "写法提取已中止。";
  }
  if (error instanceof Error && error.message.trim()) {
    return stripStructuredOutputPrefix(error.message.trim());
  }
  return "写法提取任务失败，但没有记录到明确原因。";
}

function buildExtractionDecisions(
  draft: StyleExtractionDraft,
  presetKey: PresetKey,
): Array<{ featureId: string; decision: StyleFeatureDecision }> {
  const preset = draft.presets.find((item) => item.key === presetKey);
  if (preset?.decisions?.length) {
    return preset.decisions;
  }
  return draft.features.map((feature) => ({
    featureId: feature.id,
    decision: "keep",
  }));
}

function isMissingStyleExtractionTaskTableError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
}

function formatLogValue(value: unknown): string {
  if (value == null) {
    return "null";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(String(value));
  }
}

function writeTaskLog(
  level: "info" | "warn",
  event: string,
  payload: Record<string, unknown>,
): void {
  const parts = ["[style.extraction.task]", `event=${event}`];
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) {
      continue;
    }
    parts.push(`${key}=${formatLogValue(value)}`);
  }
  console[level](parts.join(" "));
}

export class StyleExtractionTaskService {
  private readonly queue: string[] = [];

  private readonly queueSet = new Set<string>();

  private readonly activeControllers = new Map<string, AbortController>();

  private processing = false;

  private readonly styleProfileService = new StyleProfileService();

  private logTaskEvent(
    event: string,
    payload: Record<string, unknown>,
    level: "info" | "warn" = "info",
  ): void {
    writeTaskLog(level, event, payload);
  }

  private startTaskHeartbeat(taskId: string): () => void {
    const timer = setInterval(() => {
      void prisma.styleExtractionTask.updateMany({
        where: {
          id: taskId,
          status: "running",
        },
        data: {
          heartbeatAt: new Date(),
        },
      }).catch((error) => {
        this.logTaskEvent("heartbeat_update_failed", {
          taskId,
          message: error instanceof Error ? error.message : String(error),
        }, "warn");
      });
    }, STYLE_EXTRACTION_HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(timer);
    };
  }

  async createTask(input: CreateStyleExtractionTaskInput) {
    const sourceType = input.sourceType ?? "from_text";
    const sourceRefId = input.sourceRefId?.trim() || null;
    const sourceInput = buildStyleExtractionSourceInput({
      sourceText: input.sourceText,
      sourceType,
      sourceProcessingMode: input.sourceProcessingMode,
    });
    const createdTask = await prisma.styleExtractionTask.create({
      data: {
        name: input.name.trim(),
        category: input.category?.trim() || null,
        sourceText: input.sourceText,
        sourceType,
        sourceRefId,
        sourceProcessingMode: sourceInput.sourceProcessingMode,
        sourceInputText: sourceInput.sourceInputText,
        sourceInputCharLimit: sourceInput.sourceInputCharLimit,
        sourceInputCharCount: sourceInput.sourceInputCharCount,
        provider: input.provider ?? "deepseek",
        model: input.model?.trim() || null,
        temperature: input.temperature ?? 0.5,
        presetKey: input.presetKey ?? "balanced",
        status: "queued",
        maxRetries: input.maxRetries ?? 1,
        currentStage: "queued",
        currentItemLabel: input.name.trim(),
      },
    });
    const task = sourceRefId
      ? createdTask
      : await prisma.styleExtractionTask.update({
          where: { id: createdTask.id },
          data: { sourceRefId: createdTask.id },
        });
    const runtimeSettings = await getStyleEngineRuntimeSettings();
    this.logTaskEvent("task_created", {
      taskId: task.id,
      sourceType: task.sourceType,
      sourceRefId: task.sourceRefId,
      sourceProcessingMode: task.sourceProcessingMode,
      provider: task.provider,
      model: task.model,
      temperature: task.temperature,
      sourceTextChars: task.sourceText.length,
      sourceInputChars: task.sourceInputCharCount,
      presetKey: task.presetKey,
      timeoutMs: runtimeSettings.styleExtractionTimeoutMs,
    });
    this.enqueueTask(task.id);
    return task;
  }

  async retryTask(taskId: string) {
    const task = await prisma.styleExtractionTask.findUnique({
      where: { id: taskId },
    });
    if (!task) {
      throw new AppError("Style extraction task not found.", 404);
    }
    if (task.status !== "failed" && task.status !== "cancelled") {
      throw new AppError("Only failed or cancelled style extraction tasks can be retried.", 400);
    }

    await prisma.styleExtractionTask.update({
      where: { id: taskId },
      data: {
        status: "queued",
        progress: 0,
        retryCount: 0,
        pendingManualRecovery: false,
        heartbeatAt: null,
        currentStage: "queued",
        currentItemKey: null,
        currentItemLabel: task.name,
        cancelRequestedAt: null,
        error: null,
        startedAt: null,
        finishedAt: null,
        summary: null,
        createdStyleProfileId: null,
        createdStyleProfileName: null,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        llmCallCount: 0,
        lastTokenRecordedAt: null,
      },
    });
    this.logTaskEvent("task_retry_requested", {
      taskId,
      provider: task.provider,
      model: task.model,
    });
    this.enqueueTask(taskId);
    return prisma.styleExtractionTask.findUniqueOrThrow({ where: { id: taskId } });
  }

  async cancelTask(taskId: string) {
    const task = await prisma.styleExtractionTask.findUnique({
      where: { id: taskId },
    });
    if (!task) {
      throw new AppError("Style extraction task not found.", 404);
    }
    if (task.status === "succeeded" || task.status === "failed" || task.status === "cancelled") {
      throw new AppError("Only queued or running style extraction tasks can be cancelled.", 400);
    }

    if (task.status === "queued") {
      await this.markCancelled(task.id, task.progress);
    } else {
      await prisma.styleExtractionTask.update({
        where: { id: taskId },
        data: {
          cancelRequestedAt: new Date(),
          heartbeatAt: new Date(),
        },
      });
      this.activeControllers.get(taskId)?.abort();
    }
    this.logTaskEvent("task_cancel_requested", {
      taskId,
      status: task.status,
    });
    return prisma.styleExtractionTask.findUniqueOrThrow({ where: { id: taskId } });
  }

  async markPendingTasksForManualRecovery(): Promise<void> {
    try {
      const rows = await prisma.styleExtractionTask.findMany({
        where: {
          status: { in: ["queued", "running"] },
          pendingManualRecovery: false,
        },
        select: { id: true, status: true },
        orderBy: { createdAt: "asc" },
      });
      if (rows.length === 0) {
        return;
      }

      const runningIds = rows.filter((item) => item.status === "running").map((item) => item.id);
      if (runningIds.length > 0) {
        await prisma.styleExtractionTask.updateMany({
          where: { id: { in: runningIds } },
          data: {
            status: "queued",
            pendingManualRecovery: true,
            error: "服务重启后，写法提取任务已暂停，等待手动恢复。",
            heartbeatAt: null,
            currentStage: "queued",
            currentItemKey: null,
            cancelRequestedAt: null,
          },
        });
      }

      const queuedIds = rows.filter((item) => item.status === "queued").map((item) => item.id);
      if (queuedIds.length > 0) {
        await prisma.styleExtractionTask.updateMany({
          where: { id: { in: queuedIds } },
          data: {
            pendingManualRecovery: true,
            error: "服务重启后，写法提取任务已暂停，等待手动恢复。",
            heartbeatAt: null,
            cancelRequestedAt: null,
          },
        });
      }
    } catch (error) {
      if (isMissingStyleExtractionTaskTableError(error)) {
        return;
      }
      throw error;
    }
  }

  async resumeTask(taskId: string) {
    const task = await prisma.styleExtractionTask.findUnique({
      where: { id: taskId },
      select: { status: true },
    });
    if (!task) {
      throw new AppError("Style extraction task not found.", 404);
    }
    if (task.status !== "queued" && task.status !== "running") {
      throw new AppError("Only queued or running style extraction tasks can be resumed.", 400);
    }

    await prisma.styleExtractionTask.update({
      where: { id: taskId },
      data: {
        status: "queued",
        pendingManualRecovery: false,
        heartbeatAt: null,
        cancelRequestedAt: null,
      },
    });
    this.logTaskEvent("task_resume_requested", { taskId });
    this.enqueueTask(taskId);
    return prisma.styleExtractionTask.findUniqueOrThrow({ where: { id: taskId } });
  }

  private enqueueTask(taskId: string): void {
    if (this.queueSet.has(taskId)) {
      return;
    }
    this.queue.push(taskId);
    this.queueSet.add(taskId);
    void this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const taskId = this.queue.shift();
        if (!taskId) {
          continue;
        }
        this.queueSet.delete(taskId);
        await this.executeTask(taskId);
      }
    } finally {
      this.processing = false;
    }
  }

  private async executeTask(taskId: string): Promise<void> {
    const task = await prisma.styleExtractionTask.findUnique({
      where: { id: taskId },
    });
    if (!task) {
      return;
    }
    if ((task.status !== "queued" && task.status !== "running") || task.pendingManualRecovery) {
      this.logTaskEvent("task_skipped", {
        taskId,
        status: task.status,
        pendingManualRecovery: task.pendingManualRecovery,
      });
      return;
    }
    if (task.cancelRequestedAt) {
      await this.markCancelled(task.id, task.progress);
      return;
    }

    const taskSource = resolveTaskProfileSource(task);
    if (!taskSource) {
      const errorMessage = "知识库原文写法提取任务缺少来源文档 ID，无法安全生成写法。";
      await prisma.styleExtractionTask.update({
        where: { id: task.id },
        data: {
          status: "failed",
          progress: 1,
          error: errorMessage,
          heartbeatAt: null,
          currentStage: null,
          currentItemKey: null,
          currentItemLabel: task.name,
          cancelRequestedAt: null,
          finishedAt: new Date(),
        },
      });
      this.logTaskEvent("task_failed_missing_source_ref", {
        taskId: task.id,
        sourceType: task.sourceType,
      }, "warn");
      return;
    }

    const existingProfile = task.createdStyleProfileId
      ? await prisma.styleProfile.findUnique({
          where: { id: task.createdStyleProfileId },
          select: { id: true, name: true },
        })
      : await prisma.styleProfile.findFirst({
          where: {
            sourceType: taskSource.sourceType,
            sourceRefId: taskSource.sourceRefId,
            ...(taskSource.sourceType === "from_knowledge_document"
              ? {
                  name: task.name,
                  sourceContent: task.sourceText,
                }
              : {}),
          },
          select: { id: true, name: true },
        });
    if (existingProfile) {
      this.logTaskEvent("task_reused_existing_profile", {
        taskId: task.id,
        profileId: existingProfile.id,
        profileName: existingProfile.name,
      });
      await this.markSucceeded(task.id, existingProfile.id, existingProfile.name, task.summary);
      return;
    }

    const runtimeSettings = await getStyleEngineRuntimeSettings();
    const styleExtractionTimeoutMs = runtimeSettings.styleExtractionTimeoutMs;
    const extractionInputText = resolveStyleExtractionInputText(task);

    await prisma.styleExtractionTask.update({
      where: { id: task.id },
      data: {
        status: "running",
        pendingManualRecovery: false,
        progress: 0.08,
        error: null,
        startedAt: task.startedAt ?? new Date(),
        heartbeatAt: new Date(),
        currentStage: "extracting_features",
        currentItemKey: task.id,
        currentItemLabel: task.name,
      },
    });

    const controller = new AbortController();
    this.activeControllers.set(task.id, controller);
    const stopHeartbeat = this.startTaskHeartbeat(task.id);
    this.logTaskEvent("task_started", {
      taskId: task.id,
      sourceType: taskSource.sourceType,
      sourceRefId: taskSource.sourceRefId,
      provider: task.provider,
      model: task.model,
      sourceProcessingMode: task.sourceProcessingMode,
      sourceTextChars: task.sourceText.length,
      sourceInputChars: extractionInputText.length,
      timeoutMs: styleExtractionTimeoutMs,
      retryCount: task.retryCount,
      maxRetries: task.maxRetries,
    });

    try {
      await this.ensureNotCancelled(task.id);
      const extractStartedAt = Date.now();
      const draft = await runWithLlmUsageTracking({
        styleExtractionTaskId: task.id,
      }, () => this.styleProfileService.extractFromText({
        name: task.name,
        sourceText: extractionInputText,
        category: task.category ?? undefined,
        provider: task.provider as LLMProvider,
        model: task.model ?? undefined,
        temperature: task.temperature ?? undefined,
        timeoutMs: styleExtractionTimeoutMs,
        signal: controller.signal,
      }));
      this.logTaskEvent("features_extracted", {
        taskId: task.id,
        latencyMs: Date.now() - extractStartedAt,
        featureCount: draft.features.length,
        summary: draft.summary,
      });

      await this.ensureNotCancelled(task.id);
      await prisma.styleExtractionTask.update({
        where: { id: task.id },
        data: {
          progress: 0.58,
          summary: draft.summary,
          heartbeatAt: new Date(),
          currentStage: "building_profile",
          currentItemKey: task.id,
          currentItemLabel: task.name,
        },
      });

      const presetKey = (task.presetKey as PresetKey) || "balanced";
      const decisions = buildExtractionDecisions(draft, presetKey);

      await this.ensureNotCancelled(task.id);
      await prisma.styleExtractionTask.update({
        where: { id: task.id },
        data: {
          progress: 0.82,
          heartbeatAt: new Date(),
          currentStage: "saving_profile",
          currentItemKey: task.id,
          currentItemLabel: task.name,
        },
      });

      const saveStartedAt = Date.now();
      const profile = await this.styleProfileService.createProfileFromExtraction({
        name: task.name,
        sourceText: task.sourceText,
        category: task.category ?? undefined,
        draft,
        presetKey,
        decisions,
        sourceType: taskSource.sourceType,
        sourceRefId: taskSource.sourceRefId,
      });
      this.logTaskEvent("profile_created", {
        taskId: task.id,
        profileId: profile.id,
        profileName: profile.name,
        latencyMs: Date.now() - saveStartedAt,
      });

      await this.markSucceeded(task.id, profile.id, profile.name, draft.summary);
    } catch (error) {
      if (error instanceof AppError && error.message === "STYLE_EXTRACTION_TASK_CANCELLED") {
        await this.markCancelled(task.id, await this.resolveTaskProgress(task.id, task.progress));
        return;
      }
      if (isAbortError(error) && await this.isCancellationRequested(task.id)) {
        await this.markCancelled(task.id, await this.resolveTaskProgress(task.id, task.progress));
        return;
      }

      const errorMessage = normalizeTaskError(error);
      const shouldRetry = !isTimeoutError(error) && task.retryCount < task.maxRetries;
      if (shouldRetry) {
        this.logTaskEvent("task_requeued_after_error", {
          taskId: task.id,
          retryCount: task.retryCount + 1,
          maxRetries: task.maxRetries,
          errorMessage,
          rawError: error instanceof Error ? {
            name: error.name,
            message: error.message,
          } : String(error),
        }, "warn");
        await prisma.styleExtractionTask.update({
          where: { id: task.id },
          data: {
            status: "queued",
            pendingManualRecovery: false,
            progress: 0,
            retryCount: { increment: 1 },
            error: errorMessage,
            heartbeatAt: null,
            currentStage: "queued",
            currentItemKey: null,
            currentItemLabel: task.name,
            cancelRequestedAt: null,
          },
        });
        setTimeout(() => this.enqueueTask(task.id), 1500);
      } else {
        this.logTaskEvent("task_failed", {
          taskId: task.id,
          retryCount: task.retryCount,
          maxRetries: task.maxRetries,
          errorMessage,
          rawError: error instanceof Error ? {
            name: error.name,
            message: error.message,
          } : String(error),
        }, "warn");
        await prisma.styleExtractionTask.update({
          where: { id: task.id },
          data: {
            status: "failed",
            progress: 1,
            error: errorMessage,
            heartbeatAt: null,
            currentStage: null,
            currentItemKey: null,
            currentItemLabel: task.name,
            cancelRequestedAt: null,
            finishedAt: new Date(),
          },
        });
      }
    } finally {
      stopHeartbeat();
      if (this.activeControllers.get(task.id) === controller) {
        this.activeControllers.delete(task.id);
      }
    }
  }

  private async ensureNotCancelled(taskId: string): Promise<void> {
    const task = await prisma.styleExtractionTask.findUnique({
      where: { id: taskId },
      select: {
        status: true,
        cancelRequestedAt: true,
      },
    });
    if (!task || task.status === "cancelled" || task.cancelRequestedAt) {
      throw new AppError("STYLE_EXTRACTION_TASK_CANCELLED", 400);
    }
  }

  private async markSucceeded(
    taskId: string,
    profileId: string,
    profileName: string,
    summary?: string | null,
  ): Promise<void> {
    await prisma.styleExtractionTask.update({
      where: { id: taskId },
      data: {
        status: "succeeded",
        progress: 1,
        error: null,
        heartbeatAt: null,
        currentStage: null,
        currentItemKey: profileId,
        currentItemLabel: profileName,
        cancelRequestedAt: null,
        createdStyleProfileId: profileId,
        createdStyleProfileName: profileName,
        summary: summary ?? undefined,
        finishedAt: new Date(),
      },
    });
    this.logTaskEvent("task_succeeded", {
      taskId,
      profileId,
      profileName,
    });
  }

  private async markCancelled(taskId: string, progress: number): Promise<void> {
    await prisma.styleExtractionTask.update({
      where: { id: taskId },
      data: {
        status: "cancelled",
        progress,
        error: null,
        heartbeatAt: null,
        currentStage: null,
        currentItemKey: null,
        currentItemLabel: null,
        cancelRequestedAt: null,
        finishedAt: new Date(),
      },
    });
    this.logTaskEvent("task_cancelled", {
      taskId,
      progress,
    }, "warn");
  }

  private async resolveTaskProgress(taskId: string, fallback: number): Promise<number> {
    const task = await prisma.styleExtractionTask.findUnique({
      where: { id: taskId },
      select: { progress: true },
    });
    return task?.progress ?? fallback;
  }

  private async isCancellationRequested(taskId: string): Promise<boolean> {
    const task = await prisma.styleExtractionTask.findUnique({
      where: { id: taskId },
      select: {
        status: true,
        cancelRequestedAt: true,
      },
    });
    return Boolean(task && (task.status === "cancelled" || task.cancelRequestedAt));
  }
}

export const styleExtractionTaskService = new StyleExtractionTaskService();
