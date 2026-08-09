import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { TaskQueueSummaryGrid } from "@/components/taskQueue";

interface TaskCenterSummaryCardsProps {
  activeCount: number;
  waitingActionCount: number;
  mustHandleCount: number;
  qualityReminderCount: number;
}

export default function TaskCenterSummaryCards({
  activeCount,
  waitingActionCount,
  mustHandleCount,
  qualityReminderCount,
}: TaskCenterSummaryCardsProps) {
  const { t } = useTranslation();
  return (
    <TaskQueueSummaryGrid className="task-status-summary-grid" items={[
      { key: "active", label: t("tasks.summaryActive", "全局执行"), value: activeCount, detail: t("tasks.summaryActiveDetail", "运行中或排队中的任务"), tone: "info" },
      { key: "waiting", label: t("tasks.summaryWaiting", "等待操作"), value: waitingActionCount, detail: t("tasks.summaryWaitingDetail", "确认、选择或继续当前批次"), tone: waitingActionCount > 0 ? "info" : "neutral" },
      { key: "must-handle", label: t("tasks.summaryMustHandle", "必须处理"), value: mustHandleCount, detail: t("tasks.summaryMustHandleDetail", "失败、人工恢复或明确重规划"), tone: mustHandleCount > 0 ? "danger" : "neutral" },
      { key: "quality", label: t("tasks.summaryQuality", "质量提醒"), value: qualityReminderCount, detail: t("tasks.summaryQualityDetail", "可继续推进并稍后处理"), tone: qualityReminderCount > 0 ? "warning" : "neutral" },
    ]} />
  );
}
