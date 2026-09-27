interface TaskIdLike {
  directorTaskId?: string;
  taskId: string;
}

export interface FollowUpTaskOverride {
  taskId: string;
  contextKey: string;
  source: "legacy" | "manual";
}

export function resolveFollowUpSelectedTaskId<T extends TaskIdLike>(input: {
  override: FollowUpTaskOverride | null;
  contextKey: string;
  items: readonly T[];
  fallbackTaskId: string;
}): string {
  const { override, contextKey, items, fallbackTaskId } = input;
  if (!override || override.contextKey !== contextKey) {
    return fallbackTaskId;
  }
  if (override.source === "legacy" || items.some((item) => (item.directorTaskId ?? item.taskId) === override.taskId)) {
    return override.taskId;
  }
  return fallbackTaskId;
}

export function reconcileSelectedTaskIds<T extends TaskIdLike>(
  current: string[],
  items: readonly T[],
): string[] {
  if (current.length === 0) {
    return current;
  }

  const visibleTaskIds = new Set(items.map((item) => item.directorTaskId ?? item.taskId));
  const next = current.filter((taskId) => visibleTaskIds.has(taskId));

  if (next.length === current.length) {
    return current;
  }

  return next;
}
