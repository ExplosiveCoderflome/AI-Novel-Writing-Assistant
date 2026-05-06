import type {
  DirectorTaskSnapshot,
  DirectorTaskSnapshotResponse,
} from "@ai-novel/shared/types/directorRuntime";
import { DirectorEventProjectionService } from "./runtime/DirectorEventProjectionService";
import { DirectorRuntimeStore } from "./runtime/DirectorRuntimeStore";
import { DirectorStateReader } from "./DirectorStateReader";

function buildNextActions(input: {
  taskStatus: string;
  checkpointType?: string | null;
  activeStepNodeKey?: string | null;
}): string[] {
  if (input.taskStatus === "waiting_approval") {
    return input.checkpointType === "candidate_selection_required"
      ? ["confirm_candidate"]
      : ["approve_gate", "cancel"];
  }
  if (input.taskStatus === "failed") {
    return ["resume_from_checkpoint", "cancel"];
  }
  if (input.taskStatus === "running" || input.taskStatus === "queued") {
    return ["continue"];
  }
  if (input.activeStepNodeKey === "chapter_execution_contract_sync") {
    return ["continue"];
  }
  return [];
}

export class DirectorTaskSnapshotService {
  private readonly stateReader: DirectorStateReader;
  private readonly runtimeStore: DirectorRuntimeStore;
  private readonly projectionService: DirectorEventProjectionService;

  constructor(input: {
    stateReader?: DirectorStateReader;
    runtimeStore?: DirectorRuntimeStore;
    projectionService?: DirectorEventProjectionService;
  } = {}) {
    this.stateReader = input.stateReader ?? new DirectorStateReader();
    this.runtimeStore = input.runtimeStore ?? new DirectorRuntimeStore();
    this.projectionService = input.projectionService ?? new DirectorEventProjectionService();
  }

  async getTaskSnapshot(taskId: string): Promise<DirectorTaskSnapshotResponse> {
    const state = await this.stateReader.readByTaskId(taskId);
    if (!state) {
      return { snapshot: null };
    }
    const runtime = await this.runtimeStore.getSnapshot(taskId);
    const projection = this.projectionService.buildSnapshotProjection(runtime);
    const snapshot: DirectorTaskSnapshot = {
      task: {
        id: state.task.id,
        novelId: state.task.novelId,
        status: state.task.status,
        currentStage: state.task.currentStage ?? null,
        currentItemKey: state.task.currentItemKey ?? null,
        currentItemLabel: state.task.currentItemLabel ?? null,
        progress: state.task.progress ?? null,
        checkpointType: state.task.checkpointType ?? null,
        checkpointSummary: state.task.checkpointSummary ?? null,
        lastError: state.task.lastError ?? null,
        pendingManualRecovery: state.task.pendingManualRecovery ?? null,
        cancelRequestedAt: state.task.cancelRequestedAt?.toISOString() ?? null,
      },
      run: state.run,
      activeStep: state.activeStep,
      latestCommand: state.latestCommand,
      runtime,
      projection,
      recentEvents: runtime?.events.slice(-50) ?? [],
      artifacts: runtime?.artifacts ?? [],
      chapterProgress: state.chapterProgress ?? null,
      nextActions: buildNextActions({
        taskStatus: state.task.status,
        checkpointType: state.task.checkpointType ?? null,
        activeStepNodeKey: state.activeStep?.nodeKey ?? null,
      }),
    };
    return { snapshot };
  }
}
