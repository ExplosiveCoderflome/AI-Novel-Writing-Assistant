import type { AutoDirectorFollowUpItem, AutoDirectorMutationActionCode } from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { AutoDirectorFollowUpSection } from "@ai-novel/shared/types/autoDirectorValidation";
import { Button } from "@/components/ui/button";
import { TaskQueueActionRow } from "@/components/taskQueue";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

interface AutoDirectorFollowUpBatchBarProps {
  selectedItems: AutoDirectorFollowUpItem[];
  batchActionCode: AutoDirectorMutationActionCode | null;
  loading: boolean;
  onClear: () => void;
  onExecute: () => void | Promise<void>;
}

function formatBatchActionLabel(actionCode: AutoDirectorMutationActionCode | null): string {
  if (actionCode === "continue_auto_execution") {
    return "Batch low risk continues";
  }
  if (actionCode === "retry_with_task_model") {
    return "Retry abnormal tasks in batches";
  }
  return "There are no common bulk actions for the currently selected items";
}

function getSelectedSection(items: AutoDirectorFollowUpItem[]): AutoDirectorFollowUpSection | null {
  const sections = Array.from(new Set(items.map((item) => item.section)));
  return sections.length === 1 ? sections[0] : null;
}

export function AutoDirectorFollowUpBatchBar({
  selectedItems,
  batchActionCode,
  loading,
  onClear,
  onExecute,
}: AutoDirectorFollowUpBatchBarProps) {
  if (selectedItems.length === 0) {
    return null;
  }
  const selectedSection = getSelectedSection(selectedItems);
  const consequence = batchActionCode === "continue_auto_execution"
    ? "Only continue commands are submitted individually to the selected director tasks, and status will not be merged across tasks."
    : batchActionCode === "retry_with_task_model"
      ? "Each mission is retried using its own saved model and maintains the corresponding director mission identity."
      : "Batch operations will not be performed; please reselect tasks in the same partition with common actions.";

  return (
    <div className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpBatchBar}>
      <TaskQueueActionRow
        title={`已选择 ${selectedItems.length} 项 · ${selectedSection === "pending" || selectedSection === "exception" ? formatBatchActionLabel(batchActionCode) : "This partition does not provide bulk actions"}`}
        consequence={consequence}
        tone={selectedSection === "exception" ? "danger" : "info"}
        action={(
          <div className="grid grid-cols-2 gap-2 md:flex">
          <Button variant="outline" size="sm" className="w-full md:w-auto" onClick={onClear} disabled={loading}>
            Clear
                              </Button>
          <Button size="sm" className="w-full md:w-auto" onClick={() => void onExecute()} disabled={!batchActionCode || loading}>
            Execute batch actions
                              </Button>
          </div>
        )}
      />
    </div>
  );
}
