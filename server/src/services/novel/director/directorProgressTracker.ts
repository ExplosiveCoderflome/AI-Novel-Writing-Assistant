import type { DirectorProgressItemKey } from "./novelDirectorProgress";
import type {
  DirectorMarkTaskRunningCallback,
  DirectorMutatingStage,
} from "./novelDirectorPhaseTypes";

export type DirectorTrackedStage = DirectorMutatingStage;

interface DirectorTrackedCallbacks {
  markDirectorTaskRunning: DirectorMarkTaskRunningCallback;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m${seconds}s` : `${minutes}m`;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }
  return String(error);
}

function isWorkflowTaskCancelledSignal(error: unknown): boolean {
  return error instanceof Error && error.message === "WORKFLOW_TASK_CANCELLED";
}

export async function runDirectorTrackedStep<T>(input: {
  taskId: string;
  stage: DirectorTrackedStage;
  itemKey: DirectorProgressItemKey;
  itemLabel: string;
  progress: number;
  callbacks: DirectorTrackedCallbacks;
  heartbeatMs?: number;
  chapterId?: string | null;
  volumeId?: string | null;
  run: (helpers: {
    updateLabel: (nextLabel: string) => Promise<void>;
    updateStatus: (nextStatus: {
      itemKey?: DirectorProgressItemKey;
      itemLabel?: string;
      progress?: number;
    }) => Promise<void>;
    startedAt: number;
    signal: AbortSignal;
  }) => Promise<T>;
}): Promise<T> {
  const startedAt = Date.now();
  const heartbeatMs = Math.max(5000, input.heartbeatMs ?? 15000);
  const abortController = new AbortController();
  let currentItemKey = input.itemKey;
  let currentLabel = input.itemLabel;
  let currentProgress = input.progress;
  let heartbeatInFlight = false;

  const abortAsCancelled = () => {
    if (!abortController.signal.aborted) {
      abortController.abort(new Error("当前自动导演任务已取消。"));
    }
  };

  const applyStatus = async (nextStatus: {
    itemKey?: DirectorProgressItemKey;
    itemLabel?: string;
    progress?: number;
  }) => {
    currentItemKey = nextStatus.itemKey ?? currentItemKey;
    currentLabel = nextStatus.itemLabel ?? currentLabel;
    currentProgress = nextStatus.progress ?? currentProgress;
    try {
      await input.callbacks.markDirectorTaskRunning(
        input.taskId,
        input.stage,
        currentItemKey,
        currentLabel,
        currentProgress,
        {
          chapterId: input.chapterId ?? null,
          volumeId: input.volumeId ?? null,
        },
      );
    } catch (error) {
      if (isWorkflowTaskCancelledSignal(error)) {
        abortAsCancelled();
      }
      throw error;
    }
  };

  await applyStatus({
    itemKey: input.itemKey,
    itemLabel: input.itemLabel,
    progress: input.progress,
  });
  console.info(
    `[director.step] event=start taskId=${input.taskId} stage=${input.stage} itemKey=${input.itemKey} progress=${input.progress} label=${JSON.stringify(input.itemLabel)}`,
  );

  const heartbeatTimer = setInterval(() => {
    if (heartbeatInFlight) {
      return;
    }
    heartbeatInFlight = true;
    const elapsed = formatElapsed(Date.now() - startedAt);
    void input.callbacks.markDirectorTaskRunning(
      input.taskId,
      input.stage,
      currentItemKey,
      `${currentLabel}（已等待 ${elapsed}）`,
      currentProgress,
      {
        chapterId: input.chapterId ?? null,
        volumeId: input.volumeId ?? null,
      },
    ).catch((error) => {
      if (isWorkflowTaskCancelledSignal(error)) {
        abortAsCancelled();
      }
      console.warn(
        `[director.step] event=heartbeat_failed taskId=${input.taskId} stage=${input.stage} itemKey=${currentItemKey} error=${JSON.stringify(stringifyError(error))}`,
      );
    }).finally(() => {
      heartbeatInFlight = false;
    });
  }, heartbeatMs);

  try {
    const result = await input.run({
      updateLabel: async (nextLabel) => applyStatus({ itemLabel: nextLabel }),
      updateStatus: applyStatus,
      startedAt,
      signal: abortController.signal,
    });
    console.info(
      `[director.step] event=done taskId=${input.taskId} stage=${input.stage} itemKey=${currentItemKey} elapsedMs=${Date.now() - startedAt} finalLabel=${JSON.stringify(currentLabel)}`,
    );
    return result;
  } catch (error) {
    console.warn(
      `[director.step] event=failed taskId=${input.taskId} stage=${input.stage} itemKey=${currentItemKey} elapsedMs=${Date.now() - startedAt} error=${JSON.stringify(stringifyError(error))}`,
    );
    throw error;
  } finally {
    clearInterval(heartbeatTimer);
  }
}
