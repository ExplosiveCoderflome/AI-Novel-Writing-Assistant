import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TaskCenterSummaryCardsProps {
  runningCount: number;
  queuedCount: number;
  failedCount: number;
  completed24hCount: number;
}

export default function TaskCenterSummaryCards({
  runningCount,
  queuedCount,
  failedCount,
  completed24hCount,
}: TaskCenterSummaryCardsProps) {
  return (
    <div className="task-status-summary-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("gen.pages.tasks.components.TaskCenterSummaryCards.gen_d679aea3")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{runningCount}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("gen.pages.tasks.components.TaskCenterSummaryCards.gen_e5ac1d20")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{queuedCount}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("gen.pages.tasks.components.TaskCenterSummaryCards.gen_acd5cb84")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{failedCount}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("gen.pages.tasks.components.TaskCenterSummaryCards.completedIn24Hours")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold">{completed24hCount}</div>
        </CardContent>
      </Card>
    </div>
  );
}
