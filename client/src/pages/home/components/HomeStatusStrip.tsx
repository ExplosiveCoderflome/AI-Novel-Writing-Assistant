import { Activity, AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HomeMetric, HomeTone } from "../homeViewModel";
import { toneTextClass } from "./homeTone";

const metricIcons: Record<HomeTone, typeof Activity> = {
  neutral: Activity,
  info: Clock3,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
};

export function HomeStatusStrip(props: { metrics: HomeMetric[]; pending?: boolean }) {
  return (
    <section className="home-status-summary-grid grid gap-5 border-y border-border/80 py-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="创作状态摘要">
      {props.metrics.map((metric, index) => {
        const Icon = metricIcons[metric.tone];
        return (
          <div key={metric.id} className={cn("flex items-start gap-3", index > 0 && "xl:border-l xl:border-border xl:pl-5")}>
            <span className={cn("mt-0.5", toneTextClass(metric.tone))}><Icon className="h-4 w-4" aria-hidden="true" /></span>
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{metric.title}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{props.pending ? "--" : metric.value}</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.hint}</p>
            </div>
          </div>
        );
      })}
    </section>
  );
}
