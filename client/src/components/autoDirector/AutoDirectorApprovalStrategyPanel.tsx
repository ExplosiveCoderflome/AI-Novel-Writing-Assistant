import type {
  DirectorAutoApprovalGroup,
  DirectorAutoApprovalPoint,
} from "@ai-novel/shared/types/autoDirectorApproval";
import AutoDirectorApprovalPointMultiSelect, {
  summarizeDirectorAutoApprovalPoints,
} from "./AutoDirectorApprovalPointMultiSelect";

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
    <div className="mt-3 rounded-md border border-primary/15 bg-primary/5 p-3">
      <div className="text-xs font-medium text-foreground">审批策略</div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <button
          type="button"
          className={`rounded-xl border px-3 py-3 text-left transition ${
            enabled ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:border-primary/40"
          }`}
          onClick={() => onEnabledChange(true)}
        >
          <div className="text-sm font-medium text-foreground">AI 推进</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            勾选的审批点由 AI 自动通过，未勾选的审批点仍会等待你确认。
          </div>
        </button>
        <button
          type="button"
          className={`rounded-xl border px-3 py-3 text-left transition ${
            !enabled ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:border-primary/40"
          }`}
          onClick={() => onEnabledChange(false)}
        >
          <div className="text-sm font-medium text-foreground">AI 副驾</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">
            自动导演遇到审批点会停下，等你确认后再继续。
          </div>
        </button>
      </div>

      {enabled ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-md border bg-background/80 p-3 text-xs leading-5 text-muted-foreground">
            本次自动通过：{summarizeDirectorAutoApprovalPoints(approvalPointCodes)}
          </div>
          <AutoDirectorApprovalPointMultiSelect
            value={approvalPointCodes}
            onChange={onApprovalPointCodesChange}
            groups={groups}
            approvalPoints={approvalPoints}
            compact
          />
        </div>
      ) : null}
    </div>
  );
}
