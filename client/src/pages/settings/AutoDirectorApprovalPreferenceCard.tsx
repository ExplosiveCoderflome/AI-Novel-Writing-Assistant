import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { DirectorAutoApprovalPreferenceSettings } from "@ai-novel/shared/types/autoDirectorApproval";
import AutoDirectorApprovalPointMultiSelect, {
  summarizeDirectorAutoApprovalPoints,
} from "@/components/autoDirector/AutoDirectorApprovalPointMultiSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

export function AutoDirectorApprovalPreferenceCard(props: {
  settings?: DirectorAutoApprovalPreferenceSettings | null;
  draftCodes: string[];
  onDraftCodesChange: (next: string[]) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const {
    settings,
    draftCodes,
    onDraftCodesChange,
    onSave,
    isSaving,
  } = props;
  const toggleLabel = isOpen ? "收起审批授权偏好" : "展开审批授权偏好";

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1.5">
          <CardTitle>{i18next.t("settings.autoDirectorApprovalPreferenceCard.2pydxb")}</CardTitle>
          <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>{i18next.t("settings.autoDirectorApprovalPreferenceCard.7465dc")}</CardDescription>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-expanded={isOpen}
          aria-controls="auto-director-approval-preference-content"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isOpen ? "rotate-180" : "")} />
        </Button>
      </CardHeader>
      {isOpen ? (
        <CardContent id="auto-director-approval-preference-content" className="space-y-4">
          <div className={`rounded-md border bg-muted/15 p-3 text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            当前默认：{summarizeDirectorAutoApprovalPoints(draftCodes)}
          </div>
          <AutoDirectorApprovalPointMultiSelect
            value={draftCodes}
            onChange={onDraftCodesChange}
            groups={settings?.groups}
            approvalPoints={settings?.approvalPoints}
          />
          <div className={AUTO_DIRECTOR_MOBILE_CLASSES.settingsActionRow}>
            <Button className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction} onClick={onSave} disabled={isSaving}>
              {isSaving ? "保存中..." : "保存审批授权偏好"}
            </Button>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
