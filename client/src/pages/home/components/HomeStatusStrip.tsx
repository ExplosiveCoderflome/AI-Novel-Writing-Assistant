import { Activity, AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { HomeMetric, HomeTone } from "../homeViewModel";
import { toneBorderClass, toneTextClass } from "./homeTone";

const metricIcons: Record<HomeTone, typeof Activity> = {
  neutral: Activity,
  info: Clock3,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
};

export function HomeStatusStrip(props: {
  metrics: HomeMetric[];
  pending?: boolean;
}) {
  return (
    <section className="home-status-summary-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="创作状态摘要">
      {props.metrics.map((metric) => {
        const Icon = metricIcons[metric.tone];
        return (
          <Card key={metric.id} className={cn("p-4", toneBorderClass(metric.tone))}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="text-sm text-muted-foreground">{metric.title}</div>
                <div className="text-2xl font-semibold tabular-nums">
                  {props.pending ? "--" : metric.value}
                </div>
              </div>
              <span className={cn("rounded-md border border-current/15 p-2", toneTextClass(metric.tone))}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">{metric.hint}</p>
          </Card>
        );
      })}
    </section>
  );
}
