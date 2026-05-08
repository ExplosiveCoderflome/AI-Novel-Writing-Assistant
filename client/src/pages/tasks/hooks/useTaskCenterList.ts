import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TaskKind, TaskStatus, UnifiedTaskSummary } from "@ai-novel/shared/types/task";
import { listTasks } from "@/api/tasks";
import { queryKeys } from "@/api/queryKeys";
import {
  ACTIVE_STATUSES,
  ANOMALY_STATUSES,
  getTaskListPriority,
  getTimestamp,
  serializeListParams,
  type TaskSortMode,
} from "../taskCenterPage.shared";

export function useTaskCenterList(input: {
  selectedKind: TaskKind | null;
  selectedId: string | null;
  setSearchParams: React.Dispatch<React.SetStateAction<URLSearchParams>>;
}) {
  const [kind, setKind] = useState<TaskKind | "">("");
  const [status, setStatus] = useState<TaskStatus | "">("");
  const [keyword, setKeyword] = useState("");
  const [onlyAnomaly, setOnlyAnomaly] = useState(false);
  const [sortMode, setSortMode] = useState<TaskSortMode>("updated_desc");

  const listParamsKey = serializeListParams({ kind, status, keyword });
  const listQuery = useQuery({
    queryKey: queryKeys.tasks.list(listParamsKey),
    queryFn: () => listTasks({
      kind: kind || undefined,
      status: status || undefined,
      keyword: keyword.trim() || undefined,
      limit: 80,
    }),
    refetchInterval: (query) => {
      const rows = query.state.data?.data?.items ?? [];
      return rows.some((item) => ACTIVE_STATUSES.has(item.status)) ? 4000 : false;
    },
  });

  const allRows = listQuery.data?.data?.items ?? [];
  const visibleRows = useMemo(
    () =>
      (onlyAnomaly ? allRows.filter((item) => ANOMALY_STATUSES.has(item.status)) : allRows)
        .map((item, index) => ({ item, index }))
        .sort((left, right) => {
          if (sortMode !== "default") {
            const leftTime = sortMode.startsWith("heartbeat")
              ? getTimestamp(left.item.heartbeatAt)
              : getTimestamp(left.item.updatedAt);
            const rightTime = sortMode.startsWith("heartbeat")
              ? getTimestamp(right.item.heartbeatAt)
              : getTimestamp(right.item.updatedAt);
            const leftResolved = Number.isNaN(leftTime) ? -Infinity : leftTime;
            const rightResolved = Number.isNaN(rightTime) ? -Infinity : rightTime;
            const timeDiff = sortMode.endsWith("_asc")
              ? leftResolved - rightResolved
              : rightResolved - leftResolved;
            if (timeDiff !== 0) {
              return timeDiff;
            }
          }
          const priorityDiff = getTaskListPriority(left.item.status) - getTaskListPriority(right.item.status);
          if (priorityDiff !== 0) {
            return priorityDiff;
          }
          return left.index - right.index;
        })
        .map(({ item }) => item),
    [allRows, onlyAnomaly, sortMode],
  );

  useEffect(() => {
    if (!input.selectedKind || !input.selectedId) {
      if (visibleRows.length > 0) {
        const fallback = visibleRows[0];
        input.setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("kind", fallback.kind);
          next.set("id", fallback.id);
          return next;
        });
      }
      return;
    }
    const exists = visibleRows.some((item) => item.kind === input.selectedKind && item.id === input.selectedId);
    if (!exists && visibleRows.length > 0) {
      const fallback = visibleRows[0];
      input.setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("kind", fallback.kind);
        next.set("id", fallback.id);
        return next;
      });
    }
  }, [input, visibleRows]);

  const summary = {
    runningCount: allRows.filter((item) => item.status === "running").length,
    queuedCount: allRows.filter((item) => item.status === "queued").length,
    failedCount: allRows.filter((item) => item.status === "failed").length,
    completed24hCount: allRows.filter((item) => {
      if (item.status !== "succeeded") {
        return false;
      }
      const updatedAt = new Date(item.updatedAt).getTime();
      if (Number.isNaN(updatedAt)) {
        return false;
      }
      return Date.now() - updatedAt <= 24 * 60 * 60 * 1000;
    }).length,
  };

  const selectTask = (task: UnifiedTaskSummary) => {
    input.setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("kind", task.kind);
      next.set("id", task.id);
      return next;
    });
  };

  return {
    kind,
    setKind,
    status,
    setStatus,
    keyword,
    setKeyword,
    onlyAnomaly,
    setOnlyAnomaly,
    sortMode,
    setSortMode,
    allRows,
    visibleRows,
    summary,
    selectTask,
  };
}
