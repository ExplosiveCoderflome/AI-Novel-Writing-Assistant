import type { AutoDirectorFollowUpListResponse, AutoDirectorFollowUpOverview } from "@ai-novel/shared/types/autoDirectorFollowUp";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface OverviewCardConfig {
  reason: string;
  label: string;
  count: number;
}

interface AutoDirectorFollowUpOverviewCardsProps {
  overview: AutoDirectorFollowUpOverview | null;
  list: AutoDirectorFollowUpListResponse | null;
  activeReason: string;
  onReasonChange: (reason: string) => void;
}

export function AutoDirectorFollowUpOverviewCards({
  overview,
  list,
  activeReason,
  onReasonChange,
}: AutoDirectorFollowUpOverviewCardsProps) {
  const counters = list?.countersByReason ?? overview?.countersByReason;
  const cards: OverviewCardConfig[] = [
    {
      reason: "manual_recovery_required",
      label: "人工恢复",
      count: counters?.manual_recovery_required ?? 0,
    },
    {
      reason: "runtime_failed",
      label: "失败待重试",
      count: counters?.runtime_failed ?? 0,
    },
    {
      reason: "replan_required",
      label: "重规划",
      count: counters?.replan_required ?? 0,
    },
    {
      reason: "front10_execution_pending",
      label: "自动执行待继续",
      count: counters?.front10_execution_pending ?? 0,
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <Card className="xl:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">待跟进总数</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{overview?.totalCount ?? 0}</div>
          <div className="text-xs text-muted-foreground">
            今日恢复 {list?.summaryCounters.recoveredToday ?? 0} | 今日完成 {list?.summaryCounters.completedToday ?? 0}
          </div>
        </CardContent>
      </Card>

      {cards.map((card) => (
        <button
          key={card.reason}
          type="button"
          onClick={() => onReasonChange(activeReason === card.reason ? "" : card.reason)}
          className="text-left"
        >
          <Card className={cn(activeReason === card.reason && "border-primary bg-primary/5")}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{card.count}</div>
            </CardContent>
          </Card>
        </button>
      ))}
    </div>
  );
}
