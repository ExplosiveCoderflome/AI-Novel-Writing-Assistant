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
