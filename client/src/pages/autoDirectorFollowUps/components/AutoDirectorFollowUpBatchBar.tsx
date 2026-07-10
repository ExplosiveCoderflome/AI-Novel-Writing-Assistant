import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { AutoDirectorFollowUpItem, AutoDirectorMutationActionCode } from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { AutoDirectorFollowUpSection } from "@ai-novel/shared/types/autoDirectorValidation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    return t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpBatchBar.gen_358353a3");
  }
  if (actionCode === "retry_with_task_model") {
    return t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpBatchBar.gen_0f957366");
  }
  return t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpBatchBar.gen_c0cbe472");
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

  return (
    <Card className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpBatchBar}>
      <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-center md:justify-between">
        <div className={`min-w-0 text-sm ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
          已选择 {selectedItems.length} 项
          <div className="text-xs text-muted-foreground">
            {selectedSection === "pending" || selectedSection === "exception"
              ? formatBatchActionLabel(batchActionCode)
              : t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpBatchBar.gen_71049067")}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <Button variant="outline" size="sm" className="w-full md:w-auto" onClick={onClear} disabled={loading}>
            清空
          </Button>
          <Button size="sm" className="w-full md:w-auto" onClick={() => void onExecute()} disabled={!batchActionCode || loading}>
            执行批量动作
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
