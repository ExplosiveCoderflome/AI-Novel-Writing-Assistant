import type { AutoDirectorFollowUpListResponse, AutoDirectorFollowUpOverview } from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { AutoDirectorFollowUpSection } from "@ai-novel/shared/types/autoDirectorValidation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface OverviewCardConfig {
  section: AutoDirectorFollowUpSection;
  label: string;
  description: string;
  count: number;
}

interface AutoDirectorFollowUpOverviewCardsProps {
  overview: AutoDirectorFollowUpOverview | null;
  list: AutoDirectorFollowUpListResponse | null;
  activeSection: AutoDirectorFollowUpSection | "";
  onSectionChange: (section: AutoDirectorFollowUpSection) => void;
}

export function AutoDirectorFollowUpOverviewCards({
  overview,
  list,
  activeSection,
  onSectionChange,
}: AutoDirectorFollowUpOverviewCardsProps) {
  const counters = list?.countersBySection ?? overview?.countersBySection;
  const cards: OverviewCardConfig[] = [
    {
      section: "needs_validation",
      label: "需校验",
      description: "先确认任务和资产是否一致",
      count: counters?.needs_validation ?? 0,
    },
    {
      section: "exception",
      label: "异常",
      description: "失败、恢复或取消的任务",
      count: counters?.exception ?? 0,
    },
    {
      section: "pending",
      label: "待处理",
      description: "需要确认或继续的节点",
      count: counters?.pending ?? 0,
    },
    {
      section: "auto_progress",
      label: "自动推进",
      description: "排队或后台推进中的任务",
      count: counters?.auto_progress ?? 0,
    },
    {
      section: "replaced",
      label: "已替代",
      description: "被新任务接管的旧任务",
      count: counters?.replaced ?? 0,
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
      <Card className="sm:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">导演跟进中心</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{overview?.totalCount ?? 0}</div>
          <div className="text-xs text-muted-foreground">
            今日恢复 {list?.summaryCounters.recoveredToday ?? 0} 项，今日完成 {list?.summaryCounters.completedToday ?? 0} 项
          </div>
        </CardContent>
      </Card>

      <div className="auto-director-follow-up-section-grid grid grid-cols-2 gap-3 sm:contents">
        {cards.map((card) => (
          <button
            key={card.section}
            type="button"
            onClick={() => onSectionChange(card.section)}
            className="h-full text-left"
          >
            <Card className={cn("h-full", activeSection === card.section && "border-primary bg-primary/5")}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm sm:text-base">{card.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{card.count}</div>
                <div className="mt-1 text-xs text-muted-foreground">{card.description}</div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
