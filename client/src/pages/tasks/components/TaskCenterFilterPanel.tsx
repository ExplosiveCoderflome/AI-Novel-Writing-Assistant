import i18next from "i18next";
import type { TaskKind, TaskStatus } from "@ai-novel/shared/types/task";
import { Input } from "@/components/ui/input";
import type { TaskSortMode } from "../taskCenterUtils";
import SelectControl from "@/components/common/SelectControl";
import { cn } from "@/lib/utils";

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
    <section aria-label={i18next.t("tasks.taskCenterFilterPanel.m1w829")} className="task-filter-card rounded-2xl bg-muted/20 px-4 py-3">
      <div className="task-filter-controls grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[150px_150px_minmax(220px,1fr)_220px_auto] xl:items-center">
        <SelectControl
          aria-label={i18next.t("tasks.taskCenterFilterPanel.vj66rx")}
          className="task-filter-kind col-start-1 row-start-1 h-10 w-full rounded-xl border-border/45 bg-background px-3 text-sm"
          value={kind}
          onChange={(event) => onKindChange(event.target.value as TaskKind | "")}
        >
          <option value="">{i18next.t("tasks.filterKindAll")}</option>
          <option value="book_analysis">{i18next.t("tasks.filterKindBookAnalysis")}</option>
          <option value="novel_workflow">{i18next.t("tasks.filterKindNovelWorkflow")}</option>
          <option value="novel_pipeline">{i18next.t("tasks.filterKindNovelPipeline")}</option>
          <option value="knowledge_document">{i18next.t("tasks.filterKindKnowledgeDocument")}</option>
          <option value="image_generation">{i18next.t("tasks.filterKindImageGeneration")}</option>
          <option value="style_extraction">{i18next.t("tasks.filterKindStyleExtraction")}</option>
          <option value="agent_run">Agent 运行</option>
        </SelectControl>
        <SelectControl
          aria-label={i18next.t("autoDirectorFollowUps.autoDirectorFollowUpList.uc1up4")}
          className="task-filter-status col-start-2 row-start-1 h-10 w-full rounded-xl border-border/45 bg-background px-3 text-sm"
          value={status}
          onChange={(event) => onStatusChange(event.target.value as TaskStatus | "")}
        >
          <option value="">{i18next.t("tasks.filterStatusAll")}</option>
          <option value="queued">{i18next.t("tasks.filterStatusQueued")}</option>
          <option value="running">{i18next.t("tasks.filterStatusRunning")}</option>
          <option value="waiting_approval">{i18next.t("dict.gen_3ced7e48")}</option>
          <option value="failed">{i18next.t("tasks.filterStatusFailed")}</option>
          <option value="cancelled">{i18next.t("tasks.filterStatusCancelled")}</option>
          <option value="succeeded">{i18next.t("tasks.filterStatusSucceeded")}</option>
        </SelectControl>
        <label className="task-filter-pill col-start-3 row-start-1 flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-sm transition-colors">
          <input
            type="checkbox"
            className="sr-only"
            checked={onlyAnomaly}
            onChange={(event) => onOnlyAnomalyChange(event.target.checked)}
          />{i18next.t("tasks.taskCenterFilterPanel.besy2n")}</label>
        <Input
          aria-label={i18next.t("tasks.taskCenterFilterPanel.8xdxpn")}
          className="task-filter-keyword col-span-2 col-start-1 row-start-2 h-10 rounded-xl border-border/45 bg-background px-3"
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder={i18next.t("dict.gen_702bdace")}
        />
        <SelectControl
          aria-label={i18next.t("tasks.taskCenterFilterPanel.z4iruv")}
          className="task-filter-sort col-start-3 row-start-2 h-10 w-full rounded-xl border-border/45 bg-background px-3 text-sm"
          value={sortMode}
          onChange={(event) => onSortModeChange(event.target.value as TaskSortMode)}
        >
          <option value="updated_desc">{i18next.t("tasks.filterSortUpdatedDesc")}</option>
          <option value="updated_asc">{i18next.t("tasks.filterSortUpdatedAsc")}</option>
          <option value="heartbeat_desc">{i18next.t("dict.gen_29dedce4")}</option>
          <option value="heartbeat_asc">{i18next.t("dict.gen_b2fb0583")}</option>
          <option value="default">{i18next.t("tasks.taskCenterFilterPanel.f6yvz3")}</option>
        </SelectControl>
      </div>
    </section>
  );
}
