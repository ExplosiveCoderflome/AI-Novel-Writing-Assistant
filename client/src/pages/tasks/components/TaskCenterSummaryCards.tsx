import i18next from "i18next";
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
  const items = [
    { key: "active", label: i18next.t("tasks.levelRunning"), value: activeCount, dot: "bg-info" },
    { key: "waiting", label: i18next.t("tasks.taskCenterSummaryCards.fvwlgm"), value: waitingActionCount, dot: "bg-primary" },
    { key: "must-handle", label: i18next.t("onboarding.needsAction"), value: mustHandleCount, dot: "bg-destructive" },
    { key: "quality", label: i18next.t("tasks.summaryQuality"), value: qualityReminderCount, dot: "bg-warning" },
  ];

  return (
    <section aria-label={i18next.t("taskQueue.taskQueuePrimitives.x7k8ee")} className="task-status-summary-grid flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl bg-muted/25 px-5 py-3">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-2 text-sm">
          <span className={`h-2 w-2 rounded-full ${item.dot}`} aria-hidden="true" />
          <span className="text-muted-foreground">{item.label}</span>
          <span className="font-semibold tabular-nums text-foreground">{item.value}</span>
        </div>
      ))}
    </section>
  );
}
