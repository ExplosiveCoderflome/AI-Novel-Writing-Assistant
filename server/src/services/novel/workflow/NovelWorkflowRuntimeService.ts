import { NovelWorkflowService } from "./NovelWorkflowService";

const STALE_RUNNING_RECOVERY_MESSAGE = "自动导演任务长时间没有心跳，可能已因服务重启或内存不足中断。请检查后继续或重试。";

interface WorkflowRecoveryPort {
  listRecoverableAutoDirectorTasks(options?: { includeStaleRunningFlag?: boolean }): Promise<Array<{
    id: string;
    status: string;
    stale?: boolean;
  }>>;
  requeueTaskForRecovery(taskId: string, message: string): Promise<unknown>;
  restoreTaskToCheckpoint(taskId: string): Promise<unknown>;
  markTaskFailed(taskId: string, message: string): Promise<unknown>;
}

function createWorkflowService(): WorkflowRecoveryPort {
  return new NovelWorkflowService();
}

export class NovelWorkflowRuntimeService {
  constructor(private readonly workflowService: WorkflowRecoveryPort = createWorkflowService()) {}

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
}
