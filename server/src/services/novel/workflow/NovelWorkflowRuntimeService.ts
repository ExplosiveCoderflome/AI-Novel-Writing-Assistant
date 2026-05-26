import { isDirectorRecoveryNotNeededError } from "../director/runtime/novelDirectorErrors";
import { DirectorCommandService } from "../director/commands/DirectorCommandService";
import { NovelWorkflowService } from "./NovelWorkflowService";

const SERVER_RESTART_RECOVERY_MESSAGE = "自动导演任务因服务重启中断，正在尝试恢复。";
const STALE_RUNNING_RECOVERY_MESSAGE = "自动导演任务长时间没有心跳，可能已因服务重启或内存不足中断。请检查后继续或重试。";

interface WorkflowRecoveryPort {
  listRecoverableAutoDirectorTasks(options?: { includeStaleRunningFlag?: boolean }): Promise<Array<{ id: string; status: string; stale?: boolean }>>;
  requeueTaskForRecovery(taskId: string, message: string): Promise<unknown>;
  restoreTaskToCheckpoint(taskId: string): Promise<unknown>;
  markTaskFailed(taskId: string, message: string): Promise<unknown>;
}

interface DirectorRecoveryPort {
  enqueueRecoveryCommand?: (taskId: string) => Promise<unknown>;
  continueTask?: (taskId: string) => Promise<unknown>;
}

function createWorkflowService(): WorkflowRecoveryPort {
  return new NovelWorkflowService();
}

function createDirectorService(): DirectorRecoveryPort {
  return new DirectorCommandService();
}

export class NovelWorkflowRuntimeService {
  constructor(
    private readonly workflowService: WorkflowRecoveryPort = createWorkflowService(),
    private readonly directorService: DirectorRecoveryPort = createDirectorService(),
  ) {}

  async resumePendingAutoDirectorTasks(): Promise<void> {
    const rows = await this.workflowService.listRecoverableAutoDirectorTasks();
    for (const row of rows) {
      try {
        if (row.status === "running") {
          await this.workflowService.requeueTaskForRecovery(row.id, SERVER_RESTART_RECOVERY_MESSAGE);
        }
        await this.enqueueRecoveryCommand(row.id);
      } catch (error) {
        if (isDirectorRecoveryNotNeededError(error)) {
          await this.workflowService.restoreTaskToCheckpoint(row.id);
          continue;
        }
        const message = error instanceof Error ? error.message : "自动导演任务在服务重启后恢复失败。";
        await this.workflowService.markTaskFailed(row.id, `服务重启后恢复失败：${message}`);
      }
    }
  }

  async markPendingAutoDirectorTasksForManualRecovery(options: {
    staleRunningAsFailed?: boolean;
  } = {}): Promise<void> {
    const rows = await this.workflowService.listRecoverableAutoDirectorTasks({
      includeStaleRunningFlag: options.staleRunningAsFailed === true,
    });
    for (const row of rows) {
      if (options.staleRunningAsFailed === true && row.stale) {
        await this.workflowService.markTaskFailed(row.id, STALE_RUNNING_RECOVERY_MESSAGE);
        continue;
      }
      await this.workflowService.requeueTaskForRecovery(row.id, "服务重启后任务已暂停，等待手动恢复。");
    }
  }

  private enqueueRecoveryCommand(taskId: string): Promise<unknown> {
    if (this.directorService.enqueueRecoveryCommand) {
      return this.directorService.enqueueRecoveryCommand(taskId);
    }
    if (this.directorService.continueTask) {
      return this.directorService.continueTask(taskId);
    }
    throw new Error("Auto director recovery command service is unavailable.");
  }
}
