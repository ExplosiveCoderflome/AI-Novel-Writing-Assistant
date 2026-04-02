import type { NovelDirectorService } from "../director/NovelDirectorService";
import type { NovelWorkflowService } from "./NovelWorkflowService";

const SERVER_RESTART_RECOVERY_MESSAGE = "自动导演任务因服务重启中断，正在尝试恢复。";

interface WorkflowRecoveryPort {
  listRecoverableAutoDirectorTasks(): Promise<Array<{ id: string; status: string }>>;
  requeueTaskForRecovery(taskId: string, message: string): Promise<unknown>;
  markTaskFailed(taskId: string, message: string): Promise<unknown>;
}

interface DirectorRecoveryPort {
  continueTask(taskId: string): Promise<void>;
}

function createWorkflowService(): WorkflowRecoveryPort {
  const { NovelWorkflowService } = require("./NovelWorkflowService") as typeof import("./NovelWorkflowService");
  return new NovelWorkflowService();
}

function createDirectorService(): DirectorRecoveryPort {
  const { NovelDirectorService } = require("../director/NovelDirectorService") as typeof import("../director/NovelDirectorService");
  return new NovelDirectorService();
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
        await this.directorService.continueTask(row.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : "自动导演任务在服务重启后恢复失败。";
        await this.workflowService.markTaskFailed(row.id, `服务重启后恢复失败：${message}`);
      }
    }
  }
}
