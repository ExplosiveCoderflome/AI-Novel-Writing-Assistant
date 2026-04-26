interface TaskIdLike {
  taskId: string;
}

export function reconcileSelectedTaskIds<T extends TaskIdLike>(
  current: string[],
  items: readonly T[],
): string[] {
  if (current.length === 0) {
    return current;
  }

  const visibleTaskIds = new Set(items.map((item) => item.taskId));
  const next = current.filter((taskId) => visibleTaskIds.has(taskId));

  if (next.length === current.length) {
    return current;
  }

  return next;
}
