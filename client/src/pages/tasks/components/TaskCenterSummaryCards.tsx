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
  return (
    <TaskQueueSummaryGrid className="task-status-summary-grid" items={[
      { key: "active", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", value: activeCount, detail: "Running or queued tasks", tone: "info" },
      { key: "waiting", label: "Waiting for operation", value: waitingActionCount, detail: "Confirm, select or continue with current batch", tone: waitingActionCount > 0 ? "info" : "neutral" },
      { key: "must-handle", label: "must be dealt with", value: mustHandleCount, detail: "Failure, manual recovery or explicit replanning", tone: mustHandleCount > 0 ? "danger" : "neutral" },
      { key: "quality", label: "Quality reminder", value: qualityReminderCount, detail: "Can move forward and deal with it later", tone: qualityReminderCount > 0 ? "warning" : "neutral" },
    ]} />
  );
}
