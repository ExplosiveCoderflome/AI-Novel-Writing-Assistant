import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowRight, CheckCircle2, Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { getFirstNovelOnboarding } from "@/api/onboarding";
import { queryKeys } from "@/api/queryKeys";

export default function FirstNovelJourneyStrip() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: queryKeys.onboarding.firstNovel,
    queryFn: getFirstNovelOnboarding,
    staleTime: 15_000,
    refetchInterval: (state) => state.state.data?.data?.directorTask?.status === "running" ? 5000 : false,
  });
  const journey = query.data?.data;
  if (!journey || journey.graduated) {
    return null;
  }
  return (
    <Link
      to="/help"
      className="group flex flex-col gap-3 rounded-xl border bg-background px-4 py-3 transition hover:border-primary/35 hover:bg-primary/[0.025] sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Compass className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{t("onboarding.guide", "第一本书向导")}</span>
            <span className="text-xs text-muted-foreground">
              {t("onboarding.completedProgress", "{{completed}}/{{total}} 完成", {
                completed: journey.completedCount,
                total: journey.totalCount,
              })}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {t(`onboarding.headlines.${journey.currentMilestone}`, journey.headline)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex gap-1" aria-label={t("onboarding.completedProgress", "{{completed}}/{{total}} 完成", { completed: journey.completedCount, total: journey.totalCount })}>
          {journey.milestones.map((milestone) => (
            <span
              key={milestone.key}
              className={`h-1.5 w-8 rounded-full ${milestone.status === "completed" ? "bg-emerald-500" : milestone.status === "current" || milestone.status === "attention" ? "bg-primary" : "bg-muted"}`}
            />
          ))}
        </div>
        {journey.completedCount > 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
