import type { DirectorAutoApprovalPreferenceSettings } from "@ai-novel/shared/types/autoDirectorApproval";
import AutoDirectorApprovalPointMultiSelect, {
  summarizeDirectorAutoApprovalPoints,
} from "@/components/autoDirector/AutoDirectorApprovalPointMultiSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

export function AutoDirectorApprovalPreferenceCard(props: {
  settings?: DirectorAutoApprovalPreferenceSettings | null;
  draftCodes: string[];
  onDraftCodesChange: (next: string[]) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const {
    settings,
    draftCodes,
    onDraftCodesChange,
    onSave,
    isSaving,
  } = props;

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle>审批授权偏好</CardTitle>
        <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
          自动导演按范围执行时，会先带入这里的默认授权。未授权的审批点仍会停下等待你确认。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
    </Card>
  );
}
