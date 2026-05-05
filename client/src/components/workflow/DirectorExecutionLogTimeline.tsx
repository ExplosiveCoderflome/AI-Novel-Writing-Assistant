import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DirectorExecutionLogEntry } from "@ai-novel/shared/types/directorExecutionLog";
import { getDirectorExecutionLogs } from "@/api/directorExecutionLogs";
import { queryKeys } from "@/api/queryKeys";

interface DirectorExecutionLogTimelineProps {
  taskId: string | null | undefined;
  /** 是否正在运行中（用于自动刷新） */
  isRunning?: boolean;
  /** 默认是否展开 */
  defaultExpanded?: boolean;
  /** 最大显示条数 */
  maxVisible?: number;
  className?: string;
}

function levelIcon(level: string): string {
  switch (level) {
    case "success":
      return "🟢";
    case "warn":
      return "🟡";
    case "error":
      return "🔴";
    default:
      return "🔵";
  }
}

function levelTextClass(level: string): string {
  switch (level) {
    case "success":
      return "text-green-700 dark:text-green-400";
    case "warn":
      return "text-amber-700 dark:text-amber-400";
    case "error":
      return "text-red-700 dark:text-red-400";
    default:
      return "text-foreground";
  }
}

function formatLogTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "--:--:--";
  }
}

export default function DirectorExecutionLogTimeline({
  taskId,
  isRunning = false,
  defaultExpanded = true,
  maxVisible = 20,
  className,
}: DirectorExecutionLogTimelineProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const scrollRef = useRef<HTMLDivElement>(null);

  const logsQuery = useQuery({
    queryKey: queryKeys.tasks.executionLogs(taskId ?? ""),
    queryFn: () => getDirectorExecutionLogs(taskId!, { limit: 100 }),
    enabled: Boolean(taskId),
    refetchInterval: isRunning ? 3000 : false,
    staleTime: isRunning ? 1000 : 10000,
  });

  const logs: DirectorExecutionLogEntry[] = logsQuery.data?.logs ?? [];
  const visibleLogs = logs.slice(-maxVisible);

  // 自动滚动到底部
  useEffect(() => {
    if (expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [expanded, visibleLogs.length]);

  if (!taskId) return null;

  return (
    <div className={`rounded-xl border bg-background/80 ${className ?? ""}`}>
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">执行日志</span>
          {logs.length > 0 ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {logs.length} 条
            </span>
          ) : null}
          {isRunning ? (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              实时
            </span>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground">{expanded ? "收起 ▲" : "展开 ▼"}</span>
      </button>

      {expanded ? (
        <div
          ref={scrollRef}
          className="max-h-[280px] overflow-y-auto border-t px-4 pb-3 pt-2"
        >
          {visibleLogs.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              {logsQuery.isLoading ? "正在加载日志..." : "暂无执行日志"}
            </div>
          ) : (
            <div className="space-y-1">
              {visibleLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/30"
                >
                  <span className="mt-0.5 shrink-0 text-[11px]">{levelIcon(log.level)}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {formatLogTime(log.createdAt)}
                  </span>
                  <span className={`flex-1 leading-5 ${levelTextClass(log.level)}`}>
                    {log.message}
                    {log.detail ? (
                      <span className="ml-1 text-muted-foreground">— {String(log.detail)}</span>
                    ) : null}
                    {log.durationMs != null ? (
                      <span className="ml-1 text-muted-foreground">
                        ({log.durationMs > 1000 ? `${(log.durationMs / 1000).toFixed(1)}s` : `${log.durationMs}ms`})
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
          {logs.length > maxVisible ? (
            <div className="mt-2 text-center text-[11px] text-muted-foreground">
              仅显示最近 {maxVisible} 条，共 {logs.length} 条日志
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
