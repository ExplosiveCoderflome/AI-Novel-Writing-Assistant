import crypto from "node:crypto";
import { DIRECTOR_ISSUE_GOVERNANCE_VERSION, directorIssuePolicySchema } from "@ai-novel/shared/types/directorIssue";
import { prisma } from "../../db/prisma";
import {
  logPipelineInfo,
  logPipelineWarn,
  type PipelinePayload,
  type PipelineRunOptions,
} from "./novelCoreShared";
import { ensureNovelCharacters } from "./novelCoreSupport";
import { ChapterRuntimeCoordinator } from "./runtime/ChapterRuntimeCoordinator";
import { CHAPTER_ARTIFACT_BOUNDARY_TYPE } from "./runtime/artifactSync";
import { selectPrimaryPipelineJob } from "./pipelineJobDedup";
import { buildPipelineCurrentItemLabel, buildPipelineStageProgress, decoratePipelineJob as decoratePipelineJobRow, isPipelineActiveStage, parsePipelinePayload as parsePipelineJobPayload, stringifyPipelinePayload as stringifyPipelineJobPayload, type DecoratedPipelineJob, type PipelineActiveStage, type PipelineJobLike } from "./pipelineJobState";
import { NovelPipelineExecutor } from "./production/NovelPipelineExecutor";
import { isCurrentChapterProductionCompleted } from "./production/completion";
import {
  PIPELINE_EXECUTION_LEASE_MS,
  PIPELINE_EXECUTION_RENEW_INTERVAL_MS,
  PipelineExecutionLeaseService,
} from "./production/executionLease";
import { directorIssuePolicyService, loadDirectorIssueTaskContext } from "./director/issues";

export { buildPipelineCurrentItemLabel, buildPipelineStageProgress } from "./pipelineJobState";

function clampPipelineMaxRetries(value: number | null | undefined): number {
  return Math.max(0, Math.min(value ?? 1, 1));
}

export class NovelCorePipelineService {
  private static readonly activeJobIds = new Set<string>();
  private static readonly startLocks = new Set<string>();
  private readonly chapterRuntimeCoordinator = new ChapterRuntimeCoordinator();
  private readonly pipelineExecutor = new NovelPipelineExecutor(this.chapterRuntimeCoordinator);
  private readonly pipelineExecutionLeases = new PipelineExecutionLeaseService();
  private decoratePipelineJob<T extends PipelineJobLike | null>(
    job: T,
  ): T extends null ? null : DecoratedPipelineJob<Extract<T, PipelineJobLike>> {
    return (job ? decoratePipelineJobRow(job) : null) as T extends null
      ? null
      : DecoratedPipelineJob<Extract<T, PipelineJobLike>>;
  }

  private buildRangeKey(novelId: string, startOrder: number, endOrder: number): string {
    return `${novelId}:${startOrder}:${endOrder}`;
  }

  private async resolveIssuePolicySnapshot(novelId: string, options: PipelineRunOptions) {
    if (options.issueGovernanceVersion === DIRECTOR_ISSUE_GOVERNANCE_VERSION) {
      const explicit = directorIssuePolicySchema.safeParse(options.issuePolicySnapshot);
      if (explicit.success) {
        return explicit.data;
      }
    }
    const taskContext = await loadDirectorIssueTaskContext(options.workflowTaskId);
    if (taskContext) {
      return taskContext.policy;
    }
    return (await directorIssuePolicyService.getNovelPolicy(novelId)).effectivePolicy;
  }

  private async waitForStartLock(key: string): Promise<void> {
    while (NovelCorePipelineService.startLocks.has(key)) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  private async withStartLock<T>(key: string, runner: () => Promise<T>): Promise<T> {
    await this.waitForStartLock(key);
    NovelCorePipelineService.startLocks.add(key);
    try {
      return await runner();
    } finally {
      NovelCorePipelineService.startLocks.delete(key);
    }
  }

  private async listActivePipelineJobsForRange(novelId: string, startOrder: number, endOrder: number) {
    return prisma.generationJob.findMany({
      where: {
        novelId,
        startOrder,
        endOrder,
        status: { in: ["queued", "running"] },
        pendingManualRecovery: false,
      },
      orderBy: [
        { completedCount: "desc" },
        { progress: "desc" },
        { updatedAt: "desc" },
        { createdAt: "asc" },
      ],
    });
  }

  private async reconcileActivePipelineJobsForRange(input: {
    novelId: string;
    startOrder: number;
    endOrder: number;
    preferredJobId?: string | null;
  }) {
    const jobs = await this.listActivePipelineJobsForRange(input.novelId, input.startOrder, input.endOrder);
    if (jobs.length === 0) {
      return null;
    }

    const primaryJob = selectPrimaryPipelineJob(jobs, input.preferredJobId);
    const duplicateJobs = jobs.filter((job) => job.id !== primaryJob.id);

    if (duplicateJobs.length > 0) {
      const cancelledAt = new Date();
      await prisma.generationJob.updateMany({
        where: {
          id: { in: duplicateJobs.map((job) => job.id) },
          status: { in: ["queued", "running"] },
        },
        data: {
          status: "cancelled",
          error: `检测到同一本书相同章节区间存在重复流水线，已切换为主任务 ${primaryJob.id}。`,
          cancelRequestedAt: cancelledAt,
          heartbeatAt: cancelledAt,
          finishedAt: cancelledAt,
        },
      });
      logPipelineWarn("发现重复活跃批量任务，已取消重复项", {
        novelId: input.novelId,
        range: `${input.startOrder}-${input.endOrder}`,
        primaryJobId: primaryJob.id,
        cancelledJobIds: duplicateJobs.map((job) => job.id),
      });
    }

    return primaryJob;
  }

  async findActivePipelineJobForRange(
    novelId: string,
    startOrder: number,
    endOrder: number,
    preferredJobId?: string | null,
  ) {
    return this.reconcileActivePipelineJobsForRange({
      novelId,
      startOrder,
      endOrder,
      preferredJobId,
    });
  }

  async listRecoverablePipelineJobs(): Promise<Array<{ id: string; status: string }>> {
    const rows = await prisma.generationJob.findMany({
      where: {
        status: { in: ["queued", "running"] },
        pendingManualRecovery: false,
        finishedAt: null,
        cancelRequestedAt: null,
      },
      select: {
        id: true,
        status: true,
      },
      orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
    }));
  }

  async listPendingCancellationPipelineJobs(): Promise<Array<{ id: string; status: string }>> {
    const rows = await prisma.generationJob.findMany({
      where: {
        finishedAt: null,
        cancelRequestedAt: { not: null },
      },
      select: {
        id: true,
        status: true,
      },
      orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
    }));
  }

  async listStaleRecoverablePipelineJobs(cutoff: Date): Promise<Array<{ id: string; status: string }>> {
    const rows = await prisma.generationJob.findMany({
      where: {
        status: { in: ["queued", "running"] },
        pendingManualRecovery: false,
        finishedAt: null,
        cancelRequestedAt: null,
        OR: [
          { heartbeatAt: { lt: cutoff } },
          { heartbeatAt: null, updatedAt: { lt: cutoff } },
        ],
      },
      select: {
        id: true,
        status: true,
      },
      orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
    }));
  }

  async markPipelineJobFailed(jobId: string, message: string): Promise<void> {
    await this.updateJobSafe(jobId, {
      status: "failed",
      error: message.trim(),
      heartbeatAt: null,
      currentStage: null,
      currentItemKey: null,
      currentItemLabel: null,
      cancelRequestedAt: null,
      finishedAt: new Date(),
    });
  }

  async markPipelineJobCancelled(jobId: string): Promise<void> {
    await this.updateJobSafe(jobId, {
      status: "cancelled",
      heartbeatAt: null,
      currentStage: null,
      currentItemKey: null,
      currentItemLabel: null,
      cancelRequestedAt: null,
      finishedAt: new Date(),
    });
  }

  async markPipelineJobPendingManualRecovery(jobId: string, message: string): Promise<void> {
    await this.updateJobSafe(jobId, {
      status: "queued",
      error: message.trim(),
      pendingManualRecovery: true,
      heartbeatAt: null,
      currentStage: "queued",
      currentItemKey: null,
      currentItemLabel: null,
      cancelRequestedAt: null,
      finishedAt: null,
    });
  }

  async resumePipelineJob(jobId: string): Promise<void> {
    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        novelId: true,
        status: true,
        startOrder: true,
        endOrder: true,
        runMode: true,
        autoReview: true,
        autoRepair: true,
        skipCompleted: true,
        qualityThreshold: true,
        repairMode: true,
        maxRetries: true,
        payload: true,
      },
    });
    if (!job) {
      throw new Error("章节流水线任务不存在。");
    }
      if (job.status !== "queued" && job.status !== "running") {
        return;
      }
      await this.updateJobSafe(job.id, {
        status: "queued",
        pendingManualRecovery: false,
        heartbeatAt: null,
        cancelRequestedAt: null,
      });
      const payload = this.parsePipelinePayload(job.payload);
      this.schedulePipelineExecution(job.id, job.novelId, {
        startOrder: job.startOrder,
        endOrder: job.endOrder,
        controlPolicy: payload.controlPolicy,
        issueGovernanceVersion: payload.issueGovernanceVersion,
        issuePolicySnapshot: payload.issuePolicySnapshot,
        workflowTaskId: payload.workflowTaskId,
        taskStyleProfileId: payload.taskStyleProfileId,
        maxRetries: clampPipelineMaxRetries(job.maxRetries),
        runMode: job.runMode ?? payload.runMode,
        autoReview: job.autoReview ?? payload.autoReview,
        autoRepair: job.autoRepair ?? payload.autoRepair,
        skipCompleted: job.skipCompleted ?? payload.skipCompleted,
        qualityThreshold: job.qualityThreshold ?? payload.qualityThreshold,
        repairMode: job.repairMode ?? payload.repairMode,
        artifactSyncMode: payload.artifactSyncMode,
        provider: payload.provider,
        model: payload.model,
        temperature: payload.temperature,
      });
  }

  async startPipelineJob(novelId: string, options: PipelineRunOptions) {
    const rangeKey = this.buildRangeKey(novelId, options.startOrder, options.endOrder);
    return this.withStartLock(rangeKey, async () => {
      const maxRetries = clampPipelineMaxRetries(options.maxRetries);
      const issuePolicySnapshot = await this.resolveIssuePolicySnapshot(novelId, options);
      const runtimeOptions: PipelineRunOptions = {
        ...options,
        maxRetries,
        issueGovernanceVersion: DIRECTOR_ISSUE_GOVERNANCE_VERSION,
        issuePolicySnapshot,
      };
      await ensureNovelCharacters(novelId, "启动批量章节流水");

      const existingActiveJob = await this.reconcileActivePipelineJobsForRange({
        novelId,
        startOrder: options.startOrder,
        endOrder: options.endOrder,
      });
      if (existingActiveJob) {
        logPipelineWarn("检测到同区间已有活跃批量任务，复用现有任务", {
          novelId,
          range: `${options.startOrder}-${options.endOrder}`,
          reusedJobId: existingActiveJob.id,
        });
        this.schedulePipelineExecution(existingActiveJob.id, novelId, runtimeOptions);
        return this.decoratePipelineJob(existingActiveJob);
      }

      const chapterStats = await prisma.chapter.aggregate({
        where: { novelId },
        _min: { order: true },
        _max: { order: true },
        _count: { order: true },
      });
      if ((chapterStats._count.order ?? 0) === 0) {
        throw new Error("当前小说还没有章节，请先创建章节后再启动流水线。");
      }

      const chapterCandidates = await prisma.chapter.findMany({
        where: {
          novelId,
          order: { gte: options.startOrder, lte: options.endOrder },
        },
        orderBy: { order: "asc" },
        select: {
          id: true,
          content: true,
          generationState: true,
          chapterStatus: true,
          riskFlags: true,
          artifactSyncCheckpoints: {
            where: { artifactType: CHAPTER_ARTIFACT_BOUNDARY_TYPE, status: "succeeded" },
            select: { contentHash: true, metadataJson: true },
            orderBy: { updatedAt: "desc" },
            take: 6,
          },
        },
      });
      const chapters = options.skipCompleted
        ? chapterCandidates.filter((chapter) => !isCurrentChapterProductionCompleted(chapter))
        : chapterCandidates;
      if (chapters.length === 0) {
        const minOrder = chapterStats._min.order ?? 1;
        const maxOrder = chapterStats._max.order ?? 1;
        throw new Error(`指定区间内没有可生成的章节。当前可用章节范围为第 ${minOrder} 章到第 ${maxOrder} 章。`);
      }

      logPipelineInfo("创建批量任务", {
        novelId,
        range: `${options.startOrder}-${options.endOrder}`,
        matchedChapters: chapters.length,
        availableRange: `${chapterStats._min.order ?? 1}-${chapterStats._max.order ?? 1}`,
        maxRetries,
        provider: options.provider ?? "deepseek",
        model: options.model ?? "",
      });

      const job = await prisma.generationJob.create({
        data: {
          novelId,
          startOrder: options.startOrder,
          endOrder: options.endOrder,
          runMode: options.runMode ?? "fast",
          autoReview: options.autoReview ?? true,
          autoRepair: options.autoRepair ?? true,
          skipCompleted: options.skipCompleted ?? true,
          qualityThreshold: options.qualityThreshold ?? null,
          repairMode: options.repairMode ?? "light_repair",
          status: "queued",
          pendingManualRecovery: false,
          totalCount: chapters.length,
          maxRetries,
          currentStage: "queued",
          payload: this.stringifyPipelinePayload({
            provider: options.provider ?? "deepseek",
            model: options.model ?? "",
            temperature: options.temperature ?? 0.8,
            controlPolicy: options.controlPolicy,
            issueGovernanceVersion: DIRECTOR_ISSUE_GOVERNANCE_VERSION,
            issuePolicySnapshot,
            workflowTaskId: options.workflowTaskId?.trim() || undefined,
            taskStyleProfileId: options.taskStyleProfileId?.trim() || undefined,
            maxRetries,
            runMode: options.runMode ?? "fast",
            autoReview: options.autoReview ?? true,
            autoRepair: options.autoRepair ?? true,
            skipCompleted: options.skipCompleted ?? true,
            qualityThreshold: options.qualityThreshold,
            repairMode: options.repairMode ?? "light_repair",
            artifactSyncMode: options.artifactSyncMode ?? "adaptive",
          }),
        },
      });

      logPipelineInfo("批量任务已入队", {
        jobId: job.id,
        novelId,
        totalCount: job.totalCount,
      });

      this.schedulePipelineExecution(job.id, novelId, runtimeOptions);
      return this.decoratePipelineJob(job);
    });
  }

  async getPipelineJob(novelId: string, jobId: string) {
    const job = await prisma.generationJob.findFirst({ where: { id: jobId, novelId } });
    return job ? this.decoratePipelineJob(job) : null;
  }

  async getPipelineJobById(jobId: string) {
    const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
    return job ? this.decoratePipelineJob(job) : null;
  }

  async retryPipelineJob(jobId: string) {
    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      throw new Error("任务不存在。");
    }
    if (job.status !== "failed" && job.status !== "cancelled") {
      throw new Error("仅失败或已取消的任务支持重试。");
    }
    if (job.status === "cancelled" && job.cancelRequestedAt && !job.finishedAt) {
      throw new Error("任务仍在取消中，请等待取消完成后再重试。");
    }

    const payload = this.parsePipelinePayload(job.payload);
    return this.startPipelineJob(job.novelId, {
      startOrder: job.startOrder,
      endOrder: job.endOrder,
      workflowTaskId: payload.workflowTaskId,
      taskStyleProfileId: payload.taskStyleProfileId,
      issueGovernanceVersion: payload.issueGovernanceVersion,
      issuePolicySnapshot: payload.issuePolicySnapshot,
      maxRetries: clampPipelineMaxRetries(job.maxRetries),
      runMode: job.runMode ?? payload.runMode,
      autoReview: job.autoReview ?? payload.autoReview,
      autoRepair: job.autoRepair ?? payload.autoRepair,
      skipCompleted: job.skipCompleted ?? payload.skipCompleted,
      qualityThreshold: job.qualityThreshold ?? payload.qualityThreshold,
      repairMode: job.repairMode ?? payload.repairMode,
      artifactSyncMode: payload.artifactSyncMode,
      provider: payload.provider,
      model: payload.model,
      temperature: payload.temperature,
    });
  }

  async cancelPipelineJob(jobId: string) {
    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      throw new Error("任务不存在。");
    }
    if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
      throw new Error("仅排队中或运行中的任务可取消。");
    }
    if (job.status === "queued") {
      return prisma.generationJob.update({
        where: { id: jobId },
        data: {
          status: "cancelled",
          cancelRequestedAt: null,
          heartbeatAt: null,
          error: null,
          currentStage: null,
          currentItemKey: null,
          currentItemLabel: null,
          finishedAt: new Date(),
        },
      });
    }
    return prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: "cancelled",
        cancelRequestedAt: new Date(),
        heartbeatAt: new Date(),
        finishedAt: null,
      },
    });
  }

  private parsePipelinePayload(payload: string | null | undefined) {
    return parsePipelineJobPayload(payload);
  }

  private stringifyPipelinePayload(input: PipelinePayload) {
    return stringifyPipelineJobPayload(input);
  }

  private async ensurePipelineNotCancelled(jobId: string): Promise<void> {
    const job = await prisma.generationJob.findUnique({
      where: { id: jobId },
      select: {
        status: true,
        cancelRequestedAt: true,
      },
    });
    if (!job || job.status === "cancelled" || job.cancelRequestedAt) {
      throw new Error("PIPELINE_CANCELLED");
    }
  }

  private async updateJobSafe(jobId: string, data: {
    status?: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    progress?: number;
    completedCount?: number;
    totalCount?: number;
    endOrder?: number;
    retryCount?: number;
    pendingManualRecovery?: boolean;
    heartbeatAt?: Date | null;
    currentStage?: string | null;
    currentItemKey?: string | null;
    currentItemLabel?: string | null;
    cancelRequestedAt?: Date | null;
    error?: string | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
    payload?: string | null;
  }) {
    try {
      await prisma.generationJob.update({
        where: { id: jobId },
        data,
      });
    } catch {
      // 后台任务状态更新失败不应影响主服务稳定
    }
  }

  private async pauseForExecutionLeaseFailure(jobId: string, error: unknown): Promise<void> {
    const now = new Date();
    const missingLeaseColumn = Boolean(
      error
      && typeof error === "object"
      && "code" in error
      && (error as { code?: unknown }).code === "P2022",
    );
    try {
      await prisma.generationJob.updateMany({
        where: {
          id: jobId,
          status: { in: ["queued", "running"] },
          pendingManualRecovery: false,
          cancelRequestedAt: null,
          ...(!missingLeaseColumn
            ? {
                OR: [
                  { executionOwner: null },
                  { executionLeaseExpiresAt: { lt: now } },
                ],
              }
            : {}),
        },
        data: {
          status: "queued",
          pendingManualRecovery: true,
          heartbeatAt: null,
          currentStage: "queued",
          currentItemKey: null,
          currentItemLabel: null,
          error: "无法确认章节流水线执行所有权，任务已暂停。请检查数据库迁移和连接后再恢复。",
          finishedAt: null,
        },
      });
    } catch {
      // 若兼容暂停也无法落库，保留原错误日志，由人工修复数据库后恢复。
    }
  }

  private schedulePipelineExecution(jobId: string, novelId: string, options: PipelineRunOptions): void {
    if (NovelCorePipelineService.activeJobIds.has(jobId)) {
      return;
    }
    NovelCorePipelineService.activeJobIds.add(jobId);
    void this.executePipeline(jobId, novelId, options)
      .catch(() => {
        // 防止后台任务未处理拒绝导致进程不稳定
      })
      .finally(() => {
        NovelCorePipelineService.activeJobIds.delete(jobId);
      });
  }

  private async executePipeline(jobId: string, novelId: string, options: PipelineRunOptions): Promise<void> {
    const ownerId = `pipeline:${process.pid}:${crypto.randomUUID()}`;
    let claimed = false;
    try {
      claimed = await this.pipelineExecutionLeases.claim({
        jobId,
        ownerId,
        leaseMs: PIPELINE_EXECUTION_LEASE_MS,
      });
    } catch (error) {
      const message = "无法确认章节流水线执行所有权，任务已暂停。请检查数据库迁移和连接后再恢复。";
      await this.pauseForExecutionLeaseFailure(jobId, error);
      logPipelineWarn(message, {
        jobId,
        novelId,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    if (!claimed) {
      logPipelineInfo("任务已有执行者，跳过重复调度", { jobId, novelId });
      return;
    }
    const renewalTimer = setInterval(() => {
      void this.pipelineExecutionLeases.renew({
        jobId,
        ownerId,
        leaseMs: PIPELINE_EXECUTION_LEASE_MS,
      }).catch(() => false);
    }, PIPELINE_EXECUTION_RENEW_INTERVAL_MS);
    renewalTimer.unref?.();
    try {
      await this.pipelineExecutor.execute(jobId, novelId, options, ownerId);
    } finally {
      clearInterval(renewalTimer);
      await this.pipelineExecutionLeases.release(jobId, ownerId).catch(() => false);
    }
  }
}
