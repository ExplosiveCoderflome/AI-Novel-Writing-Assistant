import { prisma } from "../../../../db/prisma";
import { parseSeedPayload } from "../../workflow/novelWorkflow.shared";
import type { DirectorWorkflowSeedPayload } from "../runtime/novelDirectorHelpers";
import { ChapterExecutionProgressInspector, type ChapterExecutionProgressSummary } from "../runtime/ChapterExecutionProgressInspector";

export interface DirectorCanonicalState {
  task: {
    id: string;
    novelId: string | null;
    lane: string;
    status: string;
    currentStage?: string | null;
    currentItemKey?: string | null;
    currentItemLabel?: string | null;
    progress?: number | null;
    checkpointType?: string | null;
    checkpointSummary?: string | null;
    lastError?: string | null;
    pendingManualRecovery?: boolean | null;
    cancelRequestedAt?: Date | null;
  };
  run: {
    id: string;
    novelId: string | null;
    entrypoint?: string | null;
  } | null;
  runtime: {
    id: string;
    status: string;
    currentStep?: string | null;
    runId?: string | null;
  } | null;
  latestCommand: {
    id: string;
    commandType: string;
    status: string;
  } | null;
  activeStep: {
    idempotencyKey: string;
    nodeKey: string;
    label: string;
    status: string;
  } | null;
  seedPayload: DirectorWorkflowSeedPayload;
  chapterProgress: ChapterExecutionProgressSummary | null;
}

function shouldSuppressRuntimeActiveStep(task: {
  status: string;
  checkpointType?: string | null;
}): boolean {
  return task.status === "waiting_approval" && Boolean(task.checkpointType);
}

export class DirectorStateReader {
  constructor(
    private readonly chapterProgressInspector = new ChapterExecutionProgressInspector(),
  ) {}

  async readLatestByNovelId(novelId: string): Promise<DirectorCanonicalState | null> {
    const latestTask = await prisma.novelWorkflowTask.findFirst({
      where: {
        novelId,
        lane: "auto_director",
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    });
    if (!latestTask?.id) {
      return null;
    }
    return this.readByTaskId(latestTask.id);
  }

  async readByTaskId(taskId: string): Promise<DirectorCanonicalState | null> {
    const task = await prisma.novelWorkflowTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        novelId: true,
        lane: true,
        status: true,
        currentStage: true,
        currentItemKey: true,
        currentItemLabel: true,
        progress: true,
        checkpointType: true,
        checkpointSummary: true,
        lastError: true,
        pendingManualRecovery: true,
        cancelRequestedAt: true,
        seedPayloadJson: true,
      },
    });
    if (!task) {
      return null;
    }
    const [run, latestCommand, activeStep] = await Promise.all([
      prisma.directorRun.findUnique({
        where: { taskId },
        select: { id: true, novelId: true, entrypoint: true },
      }).catch(() => null),
      prisma.directorRunCommand.findFirst({
        where: { taskId },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: { id: true, commandType: true, status: true },
      }).catch(() => null),
      prisma.directorStepRun.findFirst({
        where: { taskId, status: { in: ["running", "waiting_approval", "blocked_scope"] } },
        orderBy: [{ updatedAt: "desc" }, { startedAt: "desc" }],
        select: { idempotencyKey: true, nodeKey: true, label: true, status: true },
      }).catch(() => null),
    ]);
    const suppressActiveStep = shouldSuppressRuntimeActiveStep(task);
    const effectiveActiveStep = suppressActiveStep ? null : activeStep;
    const chapterProgress = task.novelId
      ? await this.chapterProgressInspector.inspectNovel(task.novelId).catch(() => null)
      : null;
    return {
      task: {
        id: task.id,
        novelId: task.novelId,
        lane: task.lane,
        status: task.status,
        currentStage: task.currentStage,
        currentItemKey: task.currentItemKey,
        currentItemLabel: task.currentItemLabel,
        progress: task.progress,
        checkpointType: task.checkpointType,
        checkpointSummary: task.checkpointSummary,
        lastError: task.lastError,
        pendingManualRecovery: task.pendingManualRecovery,
        cancelRequestedAt: task.cancelRequestedAt,
      },
      run,
      runtime: run
        ? {
          id: run.id,
          status: effectiveActiveStep?.status ?? (suppressActiveStep ? task.status : latestCommand?.status) ?? "idle",
          currentStep: effectiveActiveStep?.nodeKey ?? task.currentItemKey ?? null,
          runId: run.id,
        }
        : null,
      latestCommand,
      activeStep: effectiveActiveStep,
      seedPayload: parseSeedPayload<DirectorWorkflowSeedPayload>(task.seedPayloadJson) ?? {},
      chapterProgress,
    };
  }
}
