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
      <div className="text-xs font-medium text-foreground">{i18next.t("dict.gen_4e5a0912")}</div>
      <div className={AUTO_DIRECTOR_MOBILE_CLASSES.approvalStrategyGrid}>
        <button
          type="button"
          className={`rounded-xl border px-3 py-3 text-left transition ${
            enabled ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:border-primary/40"
          }`}
          onClick={() => onEnabledChange(true)}
        >
          <div className="text-sm font-medium text-foreground">{i18next.t("dict.aiAutoAdvance")}</div>
          <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{i18next.t("autoDirector.autoDirectorApprovalStrategyPanel.9ah77u")}</div>
        </button>
        <button
          type="button"
          className={`rounded-xl border px-3 py-3 text-left transition ${
            !enabled ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:border-primary/40"
          }`}
          onClick={() => onEnabledChange(false)}
        >
          <div className="text-sm font-medium text-foreground">{i18next.t("dict.aiCopilotConfirm")}</div>
          <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{i18next.t("autoDirector.autoDirectorApprovalStrategyPanel.qj35l")}</div>
        </button>
      </div>

      <div className={`mt-3 rounded-md border bg-background/80 p-3 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
        {enabled
          ? i18next.t("dict.gen_6c318cbd")
          : i18next.t("autoDirector.autoDirectorApprovalStrategyPanel.dvbxh", { val1: summarizeDirectorAutoApprovalPoints(approvalPointCodes) })}
      </div>

      {!enabled ? (
        <details className="mt-3 rounded-md border bg-background">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground">{i18next.t("autoDirector.autoDirectorApprovalStrategyPanel.qazmyq")}</summary>
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
