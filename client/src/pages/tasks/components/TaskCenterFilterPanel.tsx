import i18next from "i18next";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  return (
    <Card className="task-filter-card">
      <CardHeader className="task-filter-header">
        <CardTitle className="text-base">{t("tasks.filterTitle", "筛选")}</CardTitle>
      </CardHeader>
      <CardContent className="task-filter-controls grid min-w-0 grid-cols-3 gap-2 xl:grid-cols-1">
        <SelectControl
          aria-label={t("tasks.filterKindAll", "按任务类型筛选")}
          className="task-filter-kind col-start-1 row-start-1 w-full rounded-md border bg-background px-2 py-2 text-sm xl:col-auto xl:row-auto"
          value={kind}
          onChange={(event) => onKindChange(event.target.value as TaskKind | "")}
        >
          <option value="">{t("tasks.filterKindAll", "全部类型")}</option>
          <option value="book_analysis">{t("tasks.filterKindBookAnalysis", "拆书分析")}</option>
          <option value="novel_workflow">{t("tasks.filterKindNovelWorkflow", "小说创作")}</option>
          <option value="novel_pipeline">{t("tasks.filterKindNovelPipeline", "小说流水线")}</option>
          <option value="knowledge_document">{t("tasks.filterKindKnowledgeDocument", "知识库索引")}</option>
          <option value="image_generation">{t("tasks.filterKindImageGeneration", "图片生成")}</option>
          <option value="style_extraction">{t("tasks.filterKindStyleExtraction", "写法提取")}</option>
          <option value="agent_run">{t("tasks.filterKindAgentRun", "Agent 运行")}</option>
        </SelectControl>
        <SelectControl
          aria-label={t("tasks.filterStatusAll", "按任务状态筛选")}
          className="task-filter-status col-start-2 row-start-1 w-full rounded-md border bg-background px-2 py-2 text-sm xl:col-auto xl:row-auto"
          value={status}
          onChange={(event) => onStatusChange(event.target.value as TaskStatus | "")}
        >
          <option value="">{t("tasks.filterStatusAll", "全部状态")}</option>
          <option value="queued">{t("tasks.filterStatusQueued", "排队中")}</option>
          <option value="running">{t("tasks.filterStatusRunning", "运行中")}</option>
          <option value="waiting_approval">{t("tasks.filterStatusWaitingApproval", "等待操作")}</option>
          <option value="succeeded">{t("tasks.filterStatusSucceeded", "已完成")}</option>
          <option value="failed">{t("tasks.filterStatusFailed", "失败")}</option>
          <option value="cancelled">{t("tasks.filterStatusCancelled", "已取消")}</option>
        </SelectControl>
        <div className="task-filter-anomaly col-start-3 row-start-1 flex items-center gap-2 xl:col-auto xl:row-auto">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyAnomaly}
              onChange={(e) => onOnlyAnomalyChange(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>{t("tasks.filterOnlyAnomaly", "仅需处理")}</span>
          </label>
        </div>
        <div className="task-filter-search col-span-2 col-start-1 row-start-2 xl:col-auto xl:row-auto">
          <Input
            type="text"
            placeholder={t("tasks.searchPlaceholder", "标题或关联对象")}
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            className="w-full text-sm"
          />
        </div>
        <SelectControl
          aria-label={t("tasks.sortLabel", "按时间排序")}
          className="task-filter-sort col-start-3 row-start-2 w-full rounded-md border bg-background px-2 py-2 text-sm xl:col-auto xl:row-auto"
          value={sortMode}
          onChange={(e) => onSortModeChange(e.target.value as TaskSortMode)}
        >
          <option value="updated_desc">{t("tasks.filterSortUpdatedDesc", "按更新时间排序：最新优先")}</option>
          <option value="updated_asc">{t("tasks.filterSortUpdatedAsc", "按更新时间排序：最早优先")}</option>
          <option value="heartbeat_desc">{t("tasks.filterSortHeartbeatDesc", "按心跳时间排序：最新优先")}</option>
          <option value="heartbeat_asc">{t("tasks.filterSortHeartbeatAsc", "按心跳时间排序：最早优先")}</option>
        </SelectControl>
      </CardContent>
    </Card>
  );
}
