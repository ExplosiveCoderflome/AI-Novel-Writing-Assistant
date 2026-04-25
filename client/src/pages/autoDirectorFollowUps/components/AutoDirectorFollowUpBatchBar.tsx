import type { AutoDirectorFollowUpItem, AutoDirectorMutationActionCode } from "@ai-novel/shared/types/autoDirectorFollowUp";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface AutoDirectorFollowUpBatchBarProps {
  selectedItems: AutoDirectorFollowUpItem[];
  batchActionCode: AutoDirectorMutationActionCode | null;
  loading: boolean;
  onClear: () => void;
  onExecute: () => void | Promise<void>;
}

function formatBatchActionLabel(actionCode: AutoDirectorMutationActionCode | null): string {
  if (actionCode === "continue_auto_execution") {
    return "批量继续自动执行";
  }
  if (actionCode === "retry_with_task_model") {
    return "批量按任务模型重试";
  }
  return "当前所选项没有共同批量动作";
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

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-center md:justify-between">
        <div className="text-sm">
          已选择 {selectedItems.length} 项
          <div className="text-xs text-muted-foreground">{formatBatchActionLabel(batchActionCode)}</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClear} disabled={loading}>
            清空
          </Button>
          <Button size="sm" onClick={() => void onExecute()} disabled={!batchActionCode || loading}>
            执行批量动作
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
