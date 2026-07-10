import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { AutoDirectorFollowUpListResponse, AutoDirectorFollowUpOverview } from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { AutoDirectorFollowUpSection } from "@ai-novel/shared/types/autoDirectorValidation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

interface OverviewCardConfig {
  section: AutoDirectorFollowUpSection | "";
  label: string;
  description: string;
  count: number;
}

interface AutoDirectorFollowUpOverviewCardsProps {
  overview: AutoDirectorFollowUpOverview | null;
  list: AutoDirectorFollowUpListResponse | null;
  activeSection: AutoDirectorFollowUpSection | "";
  onSectionChange: (section: AutoDirectorFollowUpSection | "") => void;
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
      section: "",
      label: t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpOverview.gen_a8b0c204"),
      description: t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpOverview.gen_320a65ab"),
      count: overview?.totalCount ?? list?.pagination.total ?? 0,
    },
    {
      section: "needs_validation",
      label: t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpOverview.gen_f781ac23"),
      description: t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpOverview.gen_25588213"),
      count: counters?.needs_validation ?? 0,
    },
    {
      section: "exception",
      label: t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpOverview.gen_c195df63"),
      description: t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpOverview.gen_b8c3c590"),
      count: counters?.exception ?? 0,
    },
    {
      section: "pending",
      label: t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpOverview.gen_047109de"),
      description: t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpOverview.gen_1ca27a0f"),
      count: counters?.pending ?? 0,
    },
    {
      section: "auto_progress",
      label: t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpOverview.gen_0eac0fc9"),
      description: t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpOverview.gen_10ab0f5b"),
      count: counters?.auto_progress ?? 0,
    },
    {
      section: "replaced",
      label: t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpOverview.gen_5d7c27b7"),
      description: t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpOverview.gen_d21e0a39"),
      count: counters?.replaced ?? 0,
    },
  ];

  return (
    <div className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpOverviewGrid}>
      <Card className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpOverviewCard}>
        <CardHeader className="pb-3">
          <div className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpOverviewHeader}>
            <div className="min-w-0">
              <CardTitle className="text-base">{t("gen.pages.autoDirectorFollowUps.components.AutoDirectorFollowUpOverview.gen_b46bfba6")}</CardTitle>
              <div className={`mt-1 text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                今日恢复 {list?.summaryCounters.recoveredToday ?? 0} 项，今日完成 {list?.summaryCounters.completedToday ?? 0} 项
              </div>
            </div>
            <div className="text-2xl font-semibold leading-none">{overview?.totalCount ?? 0}</div>
          </div>
        </CardHeader>
        <CardContent>
          <div className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpOverviewSectionGrid}>
            {cards.map((card) => (
              <button
                key={card.section || "all"}
                type="button"
                onClick={() => onSectionChange(card.section)}
                className={cn(
                  "h-full min-w-0 rounded-lg border bg-background p-3 text-left transition hover:border-primary/50",
                  activeSection === card.section && "border-primary bg-primary/5",
                )}
              >
                <div className="text-sm font-medium">{card.label}</div>
                <div className="mt-1 text-xl font-semibold leading-none">{card.count}</div>
                <div className={`mt-1 text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                  {card.description}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
