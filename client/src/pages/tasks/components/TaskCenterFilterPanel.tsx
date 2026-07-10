import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
        <CardTitle className="text-base">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_c2fe6253")}</CardTitle>
      </CardHeader>
      <CardContent className="task-filter-controls grid min-w-0 grid-cols-3 gap-2 xl:grid-cols-1">
        <SelectControl
          className="task-filter-kind col-start-1 row-start-1 w-full rounded-md border bg-background px-2 py-2 text-sm xl:col-auto xl:row-auto"
          value={kind}
          onChange={(event) => onKindChange(event.target.value as TaskKind | "")}
        >
          <option value="">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_c079e7d5")}</option>
          <option value="book_analysis">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_f90e9a49")}</option>
          <option value="novel_workflow">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_227c1a99")}</option>
          <option value="novel_pipeline">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_14f29641")}</option>
          <option value="knowledge_document">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_a2a62a77")}</option>
          <option value="image_generation">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_c7741980")}</option>
          <option value="style_extraction">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_f94905b4")}</option>
          <option value="agent_run">{t("gen.pages.tasks.components.TaskCenterFilterPanel.agentRunning")}</option>
        </SelectControl>
        <SelectControl
          className="task-filter-status col-start-2 row-start-1 w-full rounded-md border bg-background px-2 py-2 text-sm xl:col-auto xl:row-auto"
          value={status}
          onChange={(event) => onStatusChange(event.target.value as TaskStatus | "")}
        >
          <option value="">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_443483c9")}</option>
          <option value="queued">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_e5ac1d20")}</option>
          <option value="running">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_d679aea3")}</option>
          <option value="waiting_approval">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_3ced7e48")}</option>
          <option value="failed">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_acd5cb84")}</option>
          <option value="cancelled">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_2111ccbb")}</option>
          <option value="succeeded">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_fad5222c")}</option>
        </SelectControl>
        <label className="task-filter-pill col-start-3 row-start-1 flex items-center gap-1.5 rounded-md border bg-muted/30 px-1.5 py-2 text-xs text-muted-foreground sm:gap-2 sm:px-2 sm:text-sm xl:col-auto xl:row-auto">
          <input
            type="checkbox"
            checked={onlyAnomaly}
            onChange={(event) => onOnlyAnomalyChange(event.target.checked)}
          />
          仅看异常
        </label>
        <Input
          className="task-filter-keyword col-span-2 col-start-1 row-start-2 h-10 px-2 xl:col-auto xl:row-auto"
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder={t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_702bdace")}
        />
        <SelectControl
          className="task-filter-sort col-start-3 row-start-2 w-full rounded-md border bg-background px-2 py-2 text-sm xl:col-auto xl:row-auto"
          value={sortMode}
          onChange={(event) => onSortModeChange(event.target.value as TaskSortMode)}
        >
          <option value="updated_desc">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_cd2dd540")}</option>
          <option value="updated_asc">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_d7c527a3")}</option>
          <option value="heartbeat_desc">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_29dedce4")}</option>
          <option value="heartbeat_asc">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_b2fb0583")}</option>
          <option value="default">{t("gen.pages.tasks.components.TaskCenterFilterPanel.gen_644d8b3c")}</option>
        </SelectControl>
      </CardContent>
    </Card>
  );
}
