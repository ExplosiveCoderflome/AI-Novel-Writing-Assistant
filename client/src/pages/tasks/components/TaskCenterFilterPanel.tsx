import type { TaskKind, TaskStatus } from "@ai-novel/shared/types/task";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card className="task-filter-card">
      <CardHeader className="task-filter-header">
        <CardTitle className="text-base">filter</CardTitle>
      </CardHeader>
      <CardContent className="task-filter-controls grid min-w-0 grid-cols-3 gap-2 xl:grid-cols-1">
        <SelectControl
          aria-label="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
          className="task-filter-kind col-start-1 row-start-1 w-full rounded-md border bg-background px-2 py-2 text-sm xl:col-auto xl:row-auto"
          value={kind}
          onChange={(event) => onKindChange(event.target.value as TaskKind | "")}
        >
          <option value="">All types</option>
          <option value="book_analysis">Book split analysis</option>
          <option value="novel_workflow">Novel creation</option>
          <option value="novel_pipeline">Novel assembly line</option>
          <option value="knowledge_document">Knowledge base index</option>
          <option value="image_generation">Image generation</option>
          <option value="style_extraction">Writing extraction</option>
          <option value="agent_run">Agent running</option>
        </SelectControl>
        <SelectControl
          aria-label="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
          className="task-filter-status col-start-2 row-start-1 w-full rounded-md border bg-background px-2 py-2 text-sm xl:col-auto xl:row-auto"
          value={status}
          onChange={(event) => onStatusChange(event.target.value as TaskStatus | "")}
        >
          <option value="">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</option>
          <option value="queued">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</option>
          <option value="running">Running</option>
          <option value="waiting_approval">Waiting for approval</option>
          <option value="failed">fail</option>
          <option value="cancelled">Canceled</option>
          <option value="succeeded">Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.</option>
        </SelectControl>
        <label className="task-filter-pill col-start-3 row-start-1 flex items-center gap-1.5 rounded-md border bg-muted/30 px-1.5 py-2 text-xs text-muted-foreground sm:gap-2 sm:px-2 sm:text-sm xl:col-auto xl:row-auto">
          <input
            type="checkbox"
            checked={onlyAnomaly}
            onChange={(event) => onOnlyAnomalyChange(event.target.checked)}
          />
          Only view and need to be processed
                          </label>
        <Input
          aria-label="Search by title or related objects"
          className="task-filter-keyword col-span-2 col-start-1 row-start-2 h-10 px-2 xl:col-auto xl:row-auto"
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="title or associated object"
        />
        <SelectControl
          aria-label="How to sort tasks"
          className="task-filter-sort col-start-3 row-start-2 w-full rounded-md border bg-background px-2 py-2 text-sm xl:col-auto xl:row-auto"
          value={sortMode}
          onChange={(event) => onSortModeChange(event.target.value as TaskSortMode)}
        >
          <option value="updated_desc">Sort by update time: latest first</option>
          <option value="updated_asc">Sort by update time: oldest first</option>
          <option value="heartbeat_desc">Sort by latest heartbeat: newest first</option>
          <option value="heartbeat_asc">Sort by most recent heartbeat: oldest first</option>
          <option value="default">Default sorting: need to be processed first</option>
        </SelectControl>
      </CardContent>
    </Card>
  );
}
