import { prisma } from "../../../db/prisma";
import { withSqliteRetry } from "../../../db/sqliteRetry";
import { getArchivedTaskIdSet, isTaskArchived } from "../../task/taskArchive";
import type { TaskStatus } from "@ai-novel/shared/types/task";
import type {
  NovelWorkflowCheckpoint,
  NovelWorkflowLane,
  NovelWorkflowResumeTarget,
  NovelWorkflowStage,
} from "@ai-novel/shared/types/novelWorkflow";
import { NovelVolumeService } from "../volume/NovelVolumeService";
import { AutoDirectorFollowUpNotificationService } from "../../task/autoDirectorFollowUps/AutoDirectorFollowUpNotificationService";
import type { AutoDirectorEventWorkflowSnapshot } from "../../task/autoDirectorFollowUps/autoDirectorFollowUpEventBuilder";
import {
  buildNovelCreateResumeTarget,
  buildNovelEditResumeTarget,
  defaultWorkflowTitle,
  parseResumeTarget,
  stringifyResumeTarget,
  mergeSeedPayload,
} from "./novelWorkflow.shared";
import {
  defaultProgressForStage,
  mapStageToTab,
  stageLabel,
} from "./novelWorkflow.helpers";
import { isStaleAutoDirectorRunningTask } from "./autoDirectorStaleTaskRecovery";

export interface NovelWorkflowHealingPort {
  healAutoDirectorTaskState(taskId: string, row?: unknown): Promise<boolean>;
}

type NovelWorkflowTaskUpdateArgs = Parameters<typeof prisma.novelWorkflowTask.update>[0];
type NovelWorkflowTaskUpdateManyArgs = Parameters<typeof prisma.novelWorkflowTask.updateMany>[0];

const ACTIVE_STATUSES = ["queued", "running", "waiting_approval"] as const;

export class NovelWorkflowStoreService {
  public readonly volumeService = new NovelVolumeService();

  public readonly autoDirectorFollowUpNotificationService = new AutoDirectorFollowUpNotificationService();

  private healingPort: NovelWorkflowHealingPort | null = null;

  setHealingPort(port: NovelWorkflowHealingPort): void {
    this.healingPort = port;
  }

  public updateTaskWithRetry(args: NovelWorkflowTaskUpdateArgs) {
    return withSqliteRetry(
      () => prisma.novelWorkflowTask.update(args),
      { label: "novelWorkflowTask.update" },
    );
  }

  public updateTaskManyWithRetry(args: NovelWorkflowTaskUpdateManyArgs) {
    return withSqliteRetry(
      () => prisma.novelWorkflowTask.updateMany(args),
      { label: "novelWorkflowTask.updateMany" },
    );
  }

  private toAutoDirectorEventSnapshot(row: {
    id: string;
    novelId: string | null;
    lane: string;
    status: string;
    progress?: number | null;
    currentStage: string | null;
    checkpointType: string | null;
    checkpointSummary?: string | null;
    currentItemLabel?: string | null;
    pendingManualRecovery: boolean;
    updatedAt: Date;
    seedPayloadJson?: string | null;
    novel?: {
      title?: string | null;
    } | null;
  } | null): AutoDirectorEventWorkflowSnapshot | null {
    if (!row || row.lane !== "auto_director") {
      return null;
    }
    return {
      id: row.id,
      novelId: row.novelId,
      status: row.status as TaskStatus,
      progress: row.progress ?? null,
      currentStage: row.currentStage,
      checkpointType: row.checkpointType as NovelWorkflowCheckpoint | null,
      checkpointSummary: row.checkpointSummary ?? null,
      currentItemLabel: row.currentItemLabel ?? null,
      pendingManualRecovery: row.pendingManualRecovery,
      updatedAt: row.updatedAt,
      seedPayloadJson: row.seedPayloadJson ?? null,
      novel: row.novel ?? null,
    };
  }

  private async notifyAutoDirectorTaskTransition(input: {
    before: {
      id: string;
      novelId: string | null;
      lane: string;
      status: string;
      progress?: number | null;
      currentStage: string | null;
      checkpointType: string | null;
      checkpointSummary?: string | null;
      currentItemLabel?: string | null;
      pendingManualRecovery: boolean;
      updatedAt: Date;
      seedPayloadJson?: string | null;
      novel?: {
        title?: string | null;
      } | null;
    } | null;
    after: {
      id: string;
      novelId: string | null;
      lane: string;
      status: string;
      progress?: number | null;
      currentStage: string | null;
      checkpointType: string | null;
      checkpointSummary?: string | null;
      currentItemLabel?: string | null;
      pendingManualRecovery: boolean;
      updatedAt: Date;
      seedPayloadJson?: string | null;
      novel?: {
        title?: string | null;
      } | null;
    } | null;
  }): Promise<void> {
    await this.autoDirectorFollowUpNotificationService.handleTaskTransition({
      before: this.toAutoDirectorEventSnapshot(input.before),
      after: this.toAutoDirectorEventSnapshot(input.after),
    });
  }

  public async updateWorkflowTaskWithNotifications<T extends {
    id: string;
    novelId: string | null;
    lane: string;
    status: string;
    progress?: number | null;
    currentStage: string | null;
    checkpointType: string | null;
    checkpointSummary?: string | null;
    currentItemLabel?: string | null;
    pendingManualRecovery: boolean;
    updatedAt: Date;
    seedPayloadJson?: string | null;
  }>(input: {
    before: T;
    data: NovelWorkflowTaskUpdateArgs["data"];
  }): Promise<T> {
    const next = await withSqliteRetry(
      () => prisma.novelWorkflowTask.update({
        where: { id: input.before.id },
        data: input.data,
        include: {
          novel: {
            select: {
              title: true,
            },
          },
        },
      }),
      { label: "novelWorkflowTask.update" },
    ) as unknown as T;
    await this.notifyAutoDirectorTaskTransition({
      before: input.before,
      after: next,
    });
    return next;
  }

  public async getVisibleRowsByNovelIdRaw(novelId: string, lane?: NovelWorkflowLane) {
    const rows = await prisma.novelWorkflowTask.findMany({
      where: {
        novelId,
        ...(lane ? { lane } : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 10,
    });
    const archived = await getArchivedTaskIdSet("novel_workflow", rows.map((row) => row.id));
    return rows.filter((row) => !archived.has(row.id));
  }

  public async getVisibleRowsByNovelId(novelId: string, lane?: NovelWorkflowLane) {
    const rows = await this.getVisibleRowsByNovelIdRaw(novelId, lane);
    const healed = await Promise.all(
      rows.map((row) => this.healingPort?.healAutoDirectorTaskState(row.id, row) ?? Promise.resolve(false)),
    );
    if (!healed.some(Boolean)) {
      return rows;
    }
    return this.getVisibleRowsByNovelIdRaw(novelId, lane);
  }

  public async getVisibleRowByIdRaw(taskId: string) {
    if (await isTaskArchived("novel_workflow", taskId)) {
      return null;
    }
    return prisma.novelWorkflowTask.findUnique({
      where: { id: taskId },
    });
  }

  public async getVisibleRowById(taskId: string) {
    const existing = await this.getVisibleRowByIdRaw(taskId);
    if (!existing) {
      return null;
    }
    const healed = await (this.healingPort?.healAutoDirectorTaskState(taskId, existing) ?? Promise.resolve(false));
    if (!healed) {
      return existing;
    }
    return this.getVisibleRowByIdRaw(taskId);
  }

  public async findLatestVisibleTaskByNovelId(novelId: string, lane?: NovelWorkflowLane) {
    const rows = await this.getVisibleRowsByNovelId(novelId, lane);
    return rows[0] ?? null;
  }

  public async listVisibleTasksByNovelAndLane(novelId: string, lane: NovelWorkflowLane) {
    return this.getVisibleRowsByNovelId(novelId, lane);
  }

  public async findActiveTaskByNovelAndLane(novelId: string, lane: NovelWorkflowLane) {
    const rows = await this.getVisibleRowsByNovelId(novelId, lane);
    return rows.find((row) => ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number])) ?? null;
  }

  public async listActiveTasksByNovelAndLane(novelId: string, lane: NovelWorkflowLane) {
    const rows = await this.getVisibleRowsByNovelId(novelId, lane);
    return rows.filter((row) => ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number]));
  }

  public async listRecoverableAutoDirectorTasks(options: {
    includeStaleRunningFlag?: boolean;
  } = {}) {
    const rows = await prisma.novelWorkflowTask.findMany({
      where: {
        lane: "auto_director",
        status: {
          in: ["queued", "running"],
        },
        pendingManualRecovery: false,
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        status: true,
        lane: true,
        currentItemKey: true,
        pendingManualRecovery: true,
        cancelRequestedAt: true,
        heartbeatAt: true,
        updatedAt: true,
      },
    });
    const archived = await getArchivedTaskIdSet("novel_workflow", rows.map((row) => row.id));
    return rows
      .filter((row) => !archived.has(row.id))
      .map((row) => ({
        id: row.id,
        status: row.status,
        ...(options.includeStaleRunningFlag
          ? { stale: isStaleAutoDirectorRunningTask(row) }
          : {}),
      }));
  }

  public async getTaskById(taskId: string) {
    return this.getVisibleRowById(taskId);
  }

  public async getTaskByIdWithoutHealing(taskId: string) {
    return this.getVisibleRowByIdRaw(taskId);
  }

  public async getNovelTitle(novelId: string): Promise<string | null> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { title: true },
    });
    return novel?.title ?? null;
  }

  public buildResumeTarget(input: {
    taskId: string;
    novelId?: string | null;
    lane: NovelWorkflowLane;
    stage: NovelWorkflowStage;
    chapterId?: string | null;
    volumeId?: string | null;
  }): NovelWorkflowResumeTarget {
    if (!input.novelId) {
      return buildNovelCreateResumeTarget(input.taskId, input.lane === "auto_director" ? "director" : null);
    }
    return buildNovelEditResumeTarget({
      novelId: input.novelId,
      taskId: input.taskId,
      lane: input.lane,
      stage: mapStageToTab(input.stage),
      chapterId: input.chapterId,
      volumeId: input.volumeId,
    });
  }

  public async createWorkflow(input: {
    workflowTaskId?: string | null;
    novelId?: string | null;
    lane: NovelWorkflowLane;
    title?: string | null;
    seedPayload?: Record<string, unknown>;
    forceNew?: boolean;
    initialState?: {
      stage: NovelWorkflowStage;
      itemKey?: string | null;
      itemLabel: string;
      progress?: number;
      chapterId?: string | null;
      volumeId?: string | null;
    };
  }) {
    const novelTitle = input.novelId ? await this.getNovelTitle(input.novelId) : null;
    const initialState = input.initialState;
    const initialStage = initialState?.stage
      ?? (input.lane === "auto_director" ? "auto_director" : "project_setup");
    const initialItemKey = initialState?.itemKey
      ?? (input.lane === "auto_director" ? "auto_director" : "project_setup");
    const initialItemLabel = initialState?.itemLabel
      ?? (input.lane === "auto_director" ? "等待生成候选方向" : "等待创建项目");
    const initialProgress = initialState?.progress
      ?? (input.novelId ? defaultProgressForStage(initialStage) : 0);
    const created = await prisma.novelWorkflowTask.create({
      data: {
        novelId: input.novelId ?? null,
        lane: input.lane,
        title: defaultWorkflowTitle({
          lane: input.lane,
          title: input.title,
          novelTitle,
        }),
        status: "queued",
        progress: initialProgress,
        currentStage: stageLabel(initialStage),
        currentItemKey: initialItemKey,
        currentItemLabel: initialItemLabel,
        resumeTargetJson: stringifyResumeTarget(
          this.buildResumeTarget({
            taskId: "",
            novelId: input.novelId ?? null,
            lane: input.lane,
            stage: initialStage,
            chapterId: initialState?.chapterId,
            volumeId: initialState?.volumeId,
          }),
        ),
        seedPayloadJson: input.seedPayload ? JSON.stringify(input.seedPayload) : null,
      },
    });
    const resumeTarget = this.buildResumeTarget({
      taskId: created.id,
      novelId: created.novelId,
      lane: created.lane,
      stage: initialStage,
      chapterId: initialState?.chapterId,
      volumeId: initialState?.volumeId,
    });
    return this.updateTaskWithRetry({
      where: { id: created.id },
      data: {
        resumeTargetJson: stringifyResumeTarget(resumeTarget),
      },
    });
  }
}
