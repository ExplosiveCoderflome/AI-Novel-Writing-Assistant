import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
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
      <div className="font-medium">{t("gen.pages.tasks.components.TaskCenterMilestoneHistory.gen_8e910f68")}</div>
      {milestones.map((item) => (
        <div key={`${item.checkpointType}:${item.createdAt}`} className="rounded-md border p-2 text-muted-foreground">
          <div className="font-medium text-foreground">{formatCheckpoint(item.checkpointType)}</div>
          <div className="mt-1">{item.summary}</div>
          <div className="mt-1 text-xs">{t("gen.pages.tasks.components.TaskCenterMilestoneHistory.gen_b6387af6")}</div>
        </div>
      ))}
    </div>
  );
}
