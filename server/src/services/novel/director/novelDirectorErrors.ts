export class DirectorRecoveryNotNeededError extends Error {
  readonly code = "director_recovery_not_needed";

  constructor(message = "当前导演产物已经完整，无需继续自动导演。") {
    super(message);
    this.name = "DirectorRecoveryNotNeededError";
  }
}

export function isDirectorRecoveryNotNeededError(error: unknown): error is DirectorRecoveryNotNeededError {
  const candidate = error as { code?: unknown } | null;
  return error instanceof DirectorRecoveryNotNeededError
    || (
      Boolean(error)
      && typeof error === "object"
      && candidate?.code === "director_recovery_not_needed"
    );
}

export class DirectorTaskCancelledError extends Error {
  readonly code = "director_task_cancelled";

  constructor(message = "当前自动导演任务已取消。") {
    super(message);
    this.name = "DirectorTaskCancelledError";
  }
}

export function isDirectorTaskCancelledError(error: unknown): error is DirectorTaskCancelledError {
  const candidate = error as { code?: unknown } | null;
  return error instanceof DirectorTaskCancelledError
    || (
      Boolean(error)
      && typeof error === "object"
      && candidate?.code === "director_task_cancelled"
    );
}
