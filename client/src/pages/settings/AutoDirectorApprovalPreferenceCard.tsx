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
        <CardTitle>自动推进偏好</CardTitle>
        <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
          选择 AI 推进时，系统会按这里的默认授权先勾选本次允许自动通过的审批点；每本书启动前都可以单独调整。
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
            {isSaving ? "保存中..." : "保存自动推进偏好"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
