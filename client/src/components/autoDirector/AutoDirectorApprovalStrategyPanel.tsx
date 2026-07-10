import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type {
  DirectorAutoApprovalGroup,
  DirectorAutoApprovalPoint,
} from "@ai-novel/shared/types/autoDirectorApproval";
import AutoDirectorApprovalPointMultiSelect, {
  summarizeDirectorAutoApprovalPoints,
} from "./AutoDirectorApprovalPointMultiSelect";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

interface AutoDirectorApprovalStrategyPanelProps {
  enabled: boolean;
  approvalPointCodes: string[];
  groups?: DirectorAutoApprovalGroup[];
  approvalPoints?: DirectorAutoApprovalPoint[];
  onEnabledChange: (enabled: boolean) => void;
  onApprovalPointCodesChange: (next: string[]) => void;
}

export default function AutoDirectorApprovalStrategyPanel({
  enabled,
  approvalPointCodes,
  groups,
  approvalPoints,
  onEnabledChange,
  onApprovalPointCodesChange,
}: AutoDirectorApprovalStrategyPanelProps) {
  return (
    <div className="mt-3 min-w-0 rounded-md border border-primary/15 bg-primary/5 p-3">
      <div className="text-xs font-medium text-foreground">{t("gen.components.autoDirector.AutoDirectorApprovalStrategyPanel.gen_4e5a0912")}</div>
      <div className={AUTO_DIRECTOR_MOBILE_CLASSES.approvalStrategyGrid}>
        <button
          type="button"
          className={`rounded-xl border px-3 py-3 text-left transition ${
            enabled ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:border-primary/40"
          }`}
          onClick={() => onEnabledChange(true)}
        >
          <div className="text-sm font-medium text-foreground">{t("gen.components.autoDirector.AutoDirectorApprovalStrategyPanel.aiAutoAdvance")}</div>
          <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            目标范围内全自动推进；只有模型不可用、服务异常、保护正文或不可恢复风险会停下。
          </div>
        </button>
        <button
          type="button"
          className={`rounded-xl border px-3 py-3 text-left transition ${
            !enabled ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:border-primary/40"
          }`}
          onClick={() => onEnabledChange(false)}
        >
          <div className="text-sm font-medium text-foreground">{t("gen.components.autoDirector.AutoDirectorApprovalStrategyPanel.aiCopilotConfirm")}</div>
          <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            按高级审批授权放行低风险节点，其余审批点交给你判断。
          </div>
        </button>
      </div>

      <div className={`mt-3 rounded-md border bg-background/80 p-3 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
        {enabled
          ? t("gen.components.autoDirector.AutoDirectorApprovalStrategyPanel.gen_6c318cbd")
          : `副驾确认边界：${summarizeDirectorAutoApprovalPoints(approvalPointCodes)}。未包含的审批点会等待你确认。`}
      </div>

      {!enabled ? (
        <details className="mt-3 rounded-md border bg-background">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground">
            高级审批授权
          </summary>
          <div className="border-t p-3">
            <AutoDirectorApprovalPointMultiSelect
              value={approvalPointCodes}
              onChange={onApprovalPointCodesChange}
              groups={groups}
              approvalPoints={approvalPoints}
              compact
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
