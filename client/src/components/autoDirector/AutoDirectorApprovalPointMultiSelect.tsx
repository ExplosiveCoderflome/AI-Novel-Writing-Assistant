import {
  DIRECTOR_AUTO_APPROVAL_GROUPS,
  DIRECTOR_AUTO_APPROVAL_POINTS,
  normalizeDirectorAutoApprovalPointCodes,
  type DirectorAutoApprovalGroup,
  type DirectorAutoApprovalPoint,
} from "@ai-novel/shared/types/autoDirectorApproval";
import { Badge } from "@/components/ui/badge";

interface AutoDirectorApprovalPointMultiSelectProps {
  value: string[];
  onChange: (next: string[]) => void;
  groups?: DirectorAutoApprovalGroup[];
  approvalPoints?: DirectorAutoApprovalPoint[];
  compact?: boolean;
}

function riskLabel(riskLevel: DirectorAutoApprovalPoint["riskLevel"]): string {
  if (riskLevel === "high") return "高风险";
  if (riskLevel === "medium") return "中风险";
  return "低风险";
}

function riskClassName(riskLevel: DirectorAutoApprovalPoint["riskLevel"]): string {
  if (riskLevel === "high") return "border-amber-500/40 bg-amber-500/10 text-amber-800";
  if (riskLevel === "medium") return "border-sky-500/30 bg-sky-500/10 text-sky-800";
  return "";
}

function toggleCodes(current: string[], targetCodes: string[], checked: boolean): string[] {
  const currentSet = new Set(current);
  if (checked) {
    targetCodes.forEach((code) => currentSet.add(code));
  } else {
    targetCodes.forEach((code) => currentSet.delete(code));
  }
  return normalizeDirectorAutoApprovalPointCodes(Array.from(currentSet), []);
}

export function summarizeDirectorAutoApprovalPoints(codes: string[]): string {
  const normalized = normalizeDirectorAutoApprovalPointCodes(codes, []);
  if (normalized.length === 0) {
    return "不会自动通过审批点";
  }
  const labels: string[] = normalized
    .map((code) => DIRECTOR_AUTO_APPROVAL_POINTS.find((item) => item.code === code)?.label)
    .filter((label): label is NonNullable<typeof label> => Boolean(label));
  if (labels.length <= 2) {
    return labels.join("、");
  }
  return `${labels.slice(0, 2).join("、")} 等 ${labels.length} 项`;
}

export default function AutoDirectorApprovalPointMultiSelect({
  value,
  onChange,
  groups = DIRECTOR_AUTO_APPROVAL_GROUPS.map((item) => ({ ...item })),
  approvalPoints = DIRECTOR_AUTO_APPROVAL_POINTS.map((item) => ({ ...item })),
  compact = false,
}: AutoDirectorApprovalPointMultiSelectProps) {
  const selected = normalizeDirectorAutoApprovalPointCodes(value, []);

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const points = approvalPoints.filter((item) => item.groupId === group.id);
        if (points.length === 0) {
          return null;
        }
        const pointCodes = points.map((item) => item.code);
        const selectedCount = pointCodes.filter((code) => selected.includes(code)).length;
        const allSelected = selectedCount === pointCodes.length;
        return (
          <section key={group.id} className="rounded-md border bg-background p-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={allSelected}
                onChange={(event) => onChange(toggleCodes(selected, pointCodes, event.target.checked))}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{group.label}</span>
                  <Badge variant="outline">{selectedCount}/{pointCodes.length}</Badge>
                </div>
                <div className="mt-1 text-xs leading-5 text-muted-foreground">{group.description}</div>
              </div>
            </label>

            <div className={`mt-3 grid gap-2 ${compact ? "" : "md:grid-cols-2"}`}>
              {points.map((point) => {
                const checked = selected.includes(point.code);
                return (
                  <label key={point.code} className="flex min-w-0 items-start gap-3 rounded-md border p-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={(event) => onChange(toggleCodes(selected, [point.code], event.target.checked))}
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{point.label}</span>
                        <Badge variant="outline" className={riskClassName(point.riskLevel)}>
                          {riskLabel(point.riskLevel)}
                        </Badge>
                      </div>
                      <div className="text-xs leading-5 text-muted-foreground">{point.description}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
