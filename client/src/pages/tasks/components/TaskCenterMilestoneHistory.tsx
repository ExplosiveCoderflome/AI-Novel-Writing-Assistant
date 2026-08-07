import type { NovelWorkflowMilestone } from "@ai-novel/shared/types/novelWorkflow";
import { formatCheckpoint, formatDate } from "../taskCenterUtils";

interface TaskCenterMilestoneHistoryProps {
  milestones: NovelWorkflowMilestone[];
}

export default function TaskCenterMilestoneHistory({
  milestones,
}: TaskCenterMilestoneHistoryProps) {
  if (milestones.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      <div className="font-medium">Milestone History</div>
      {milestones.map((item) => (
        <div key={`${item.checkpointType}:${item.createdAt}`} className="rounded-md border p-2 text-muted-foreground">
          <div className="font-medium text-foreground">{formatCheckpoint(item.checkpointType)}</div>
          <div className="mt-1">{item.summary}</div>
          <div className="mt-1 text-xs">Recording time:{formatDate(item.createdAt)}</div>
        </div>
      ))}
    </div>
  );
}
