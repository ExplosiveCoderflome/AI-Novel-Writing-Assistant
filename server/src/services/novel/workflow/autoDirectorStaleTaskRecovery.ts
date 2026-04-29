const DEFAULT_STALE_RUNNING_TASK_MS = 90 * 60 * 1000;

function resolveStaleRunningTaskMs(): number {
  const configured = Number(process.env.AUTO_DIRECTOR_STALE_RUNNING_TASK_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_STALE_RUNNING_TASK_MS;
}

function isStructuredOutlineItemKey(itemKey: string | null | undefined): boolean {
  return itemKey === "beat_sheet"
    || itemKey === "chapter_list"
    || itemKey === "chapter_sync"
    || itemKey === "chapter_detail_bundle";
}

function isAutoExecutionItemKey(itemKey: string | null | undefined): boolean {
  return itemKey === "chapter_execution" || itemKey === "quality_repair";
}

function isRecoverableRunningItemKey(itemKey: string | null | undefined): boolean {
  return isStructuredOutlineItemKey(itemKey) || isAutoExecutionItemKey(itemKey);
}

function resolveLastActivityAt(row: {
  heartbeatAt?: Date | null;
  updatedAt?: Date | null;
}): Date | null {
  return row.heartbeatAt ?? row.updatedAt ?? null;
}

export function isStaleAutoDirectorRunningTask(
  row: {
    lane?: string | null;
    status?: string | null;
    currentItemKey?: string | null;
    pendingManualRecovery?: boolean | null;
    cancelRequestedAt?: Date | null;
    heartbeatAt?: Date | null;
    updatedAt?: Date | null;
  },
  now = new Date(),
): boolean {
  if (
    row.lane !== "auto_director"
    || row.status !== "running"
    || row.pendingManualRecovery
    || row.cancelRequestedAt
    || !isRecoverableRunningItemKey(row.currentItemKey)
  ) {
    return false;
  }
  const lastActivityAt = resolveLastActivityAt(row);
  if (!lastActivityAt) {
    return true;
  }
  return now.getTime() - lastActivityAt.getTime() >= resolveStaleRunningTaskMs();
}

export const STALE_AUTO_DIRECTOR_RUNNING_MESSAGE = "自动导演任务长时间没有心跳，可能已因服务重启或内存不足中断。请检查后继续或重试。";
