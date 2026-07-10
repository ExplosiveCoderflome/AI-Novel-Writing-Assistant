import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { DirectorDashboardView } from "@ai-novel/shared/types/directorRuntime";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { Badge } from "@/components/ui/badge";
import {
  formatCheckpoint,
  formatDate,
  formatKind,
  formatResumeTarget,
  formatStatus,
  formatTokenCount,
  toStatusVariant,
} from "../taskCenterUtils";

interface TaskCenterDetailSummaryProps {
  task: UnifiedTaskDetail;
  isAutoDirectorTask: boolean;
  currentModelLabel: string;
  dashboardView?: DirectorDashboardView | null;
}

export default function TaskCenterDetailSummary({
  task,
  isAutoDirectorTask,
  currentModelLabel,
  dashboardView,
}: TaskCenterDetailSummaryProps) {
  const progressPercent = typeof dashboardView?.progressPercent === "number"
    ? dashboardView.progressPercent
    : Math.round(task.progress * 100);
  const currentStage = dashboardView?.stageLabel ?? task.currentStage ?? t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_f61f4cf6");
  const currentItem = dashboardView?.currentAction ?? task.currentItemLabel ?? t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_f61f4cf6");

  return (
    <>
      <div className="space-y-1">
        <div className="font-medium">{task.title}</div>
        <div className="text-xs text-muted-foreground">
          {formatKind(task.kind)} | 归属：{task.ownerLabel}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant={toStatusVariant(task.status)}>{formatStatus(task.status)}</Badge>
        <Badge variant="outline">{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_43c5687e")}</Badge>
      </div>
      <div className="space-y-1 text-muted-foreground">
        <div>{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_e13d1f0f")}</div>
        <div>{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_2451c11e")}</div>
        <div>{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_63e2be52")}</div>
        {task.kind === "novel_workflow" ? (
          <>
            <div>{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_6004d2a0")}</div>
            <div>{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_f305a266")}</div>
            <div>{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_27949847")}</div>
            <div>{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_b168d8f2")}</div>
          </>
        ) : null}
        {task.blockingReason ? (
          <div>{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_cae7c1b1")}</div>
        ) : null}
        <div>{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_e58aa324")}</div>
        <div>{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_6c90f8c5")}</div>
        <div>{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_f0ecbc3d")}</div>
        <div>{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_3ab98309")}</div>
        {(task.provider || task.model) ? (
          <div>{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_56831d5b")}</div>
        ) : null}
        {isAutoDirectorTask ? (
          <div>{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_47fdc247")}</div>
        ) : null}
        {(task.tokenUsage || task.provider || task.model) ? (
          <>
            <div>{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_bcf87177")}</div>
            <div>{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_dda56469")}</div>
            <div>{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_a46d77bf")}</div>
            <div>{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_e3ecc98e")}</div>
            <div>{t("gen.pages.tasks.components.TaskCenterDetailSummary.gen_af4d758d")}</div>
          </>
        ) : null}
      </div>
    </>
  );
}
