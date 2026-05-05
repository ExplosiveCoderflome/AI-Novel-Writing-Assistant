import { prisma } from "../../../db/prisma";
import { buildRuntimeEventId, stableJson } from "./DirectorRuntimeExecutionHelpers";

export class DirectorStateCommitter {
  async recordPipelineDispatch(input: {
    taskId: string;
    novelId?: string | null;
    runtimeId?: string | null;
    runtimeCommandId?: string | null;
    executionId?: string | null;
    commandType: string;
    summary: string;
  }): Promise<void> {
    if (!input.runtimeId) {
      return;
    }
    await prisma.directorRuntimeEvent.create({
      data: {
        id: buildRuntimeEventId(input.runtimeId, "pipeline_dispatch"),
        runtimeId: input.runtimeId,
        commandId: input.runtimeCommandId,
        executionId: input.executionId,
        workflowTaskId: input.taskId,
        novelId: input.novelId,
        type: "pipeline_dispatch",
        summary: input.summary,
        severity: "low",
        metadataJson: stableJson({ commandType: input.commandType }),
        occurredAt: new Date(),
      },
    }).catch(() => undefined);
  }

  async markRuntimeWaitingGate(input: {
    runtimeId?: string | null;
    taskId: string;
    novelId?: string | null;
    message: string;
  }): Promise<void> {
    const now = new Date();
    if (input.runtimeId) {
      await prisma.directorRuntimeInstance.update({
        where: { id: input.runtimeId },
        data: {
          status: "waiting_gate",
          workerMessage: input.message,
          lastHeartbeatAt: now,
        },
      }).catch(() => undefined);
    }
    await prisma.novelWorkflowTask.update({
      where: { id: input.taskId },
      data: {
        status: "waiting_approval",
        currentItemLabel: input.message,
      },
    }).catch(() => undefined);
  }
}
