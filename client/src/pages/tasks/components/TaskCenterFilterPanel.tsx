import type { TaskKind, TaskStatus } from "@ai-novel/shared/types/task";
import { Input } from "@/components/ui/input";
import type { TaskSortMode } from "../taskCenterUtils";
import SelectControl from "@/components/common/SelectControl";

interface TaskCenterFilterPanelProps {
  kind: TaskKind | "";
  status: TaskStatus | "";
  keyword: string;
  onlyAnomaly: boolean;
  sortMode: TaskSortMode;
  onKindChange: (value: TaskKind | "") => void;
  onStatusChange: (value: TaskStatus | "") => void;
  onKeywordChange: (value: string) => void;
  onOnlyAnomalyChange: (value: boolean) => void;
  onSortModeChange: (value: TaskSortMode) => void;
}

export default function TaskCenterFilterPanel({
  kind,
  status,
  keyword,
  onlyAnomaly,
  sortMode,
  onKindChange,
  onStatusChange,
  onKeywordChange,
  onOnlyAnomalyChange,
  onSortModeChange,
}: TaskCenterFilterPanelProps) {
  return (
    <section aria-label="筛选运行记录" className="task-filter-card rounded-2xl bg-muted/20 px-4 py-3">
      <div className="task-filter-controls grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[150px_150px_minmax(220px,1fr)_220px_auto] xl:items-center">
        <SelectControl
          aria-label="按任务类型筛选"
          className="task-filter-kind h-10 w-full rounded-xl border-border/45 bg-background px-3 text-sm"
          value={kind}
          onChange={(event) => onKindChange(event.target.value as TaskKind | "")}
        >
          <option value="">全部类型</option>
          <option value="book_analysis">拆书分析</option>
          <option value="novel_workflow">小说创作</option>
          <option value="novel_pipeline">小说流水线</option>
          <option value="knowledge_document">知识库索引</option>
          <option value="image_generation">图片生成</option>
          <option value="style_extraction">写法提取</option>
          <option value="agent_run">Agent 运行</option>
        </SelectControl>
        <SelectControl
          aria-label="按任务状态筛选"
          className="task-filter-status h-10 w-full rounded-xl border-border/45 bg-background px-3 text-sm"
          value={status}
          onChange={(event) => onStatusChange(event.target.value as TaskStatus | "")}
        >
          <option value="">全部状态</option>
          <option value="queued">排队中</option>
          <option value="running">运行中</option>
          <option value="waiting_approval">等待审批</option>
          <option value="failed">失败</option>
          <option value="cancelled">已取消</option>
          <option value="succeeded">已完成</option>
        </SelectControl>
        <Input
          aria-label="按标题或关联对象搜索"
          className="task-filter-keyword h-10 rounded-xl border-border/45 bg-background px-3"
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="标题或关联对象"
        />
        <SelectControl
          aria-label="任务排序方式"
          className="task-filter-sort h-10 w-full rounded-xl border-border/45 bg-background px-3 text-sm"
          value={sortMode}
          onChange={(event) => onSortModeChange(event.target.value as TaskSortMode)}
        >
          <option value="updated_desc">按更新时间排序：最新优先</option>
          <option value="updated_asc">按更新时间排序：最早优先</option>
          <option value="heartbeat_desc">按最近心跳排序：最新优先</option>
          <option value="heartbeat_asc">按最近心跳排序：最早优先</option>
          <option value="default">默认排序：需处理优先</option>
        </SelectControl>
        <label className={`task-filter-pill flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-sm transition-colors ${
          onlyAnomaly ? "bg-destructive/10 text-destructive" : "bg-background text-muted-foreground hover:bg-muted"
        }`}>
          <input
            type="checkbox"
            className="sr-only"
            checked={onlyAnomaly}
            onChange={(event) => onOnlyAnomalyChange(event.target.checked)}
          />
          只看需处理
        </label>
      </div>
    </section>
  );
}
