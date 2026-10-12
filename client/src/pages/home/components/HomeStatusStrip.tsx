import { Activity, BookOpenCheck, CheckCircle2, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HomeMetric, HomeTone } from "../homeViewModel";
import { toneSurfaceClass, toneTextClass } from "./homeTone";

const metricIcons: Record<string, typeof Activity> = {
  running: Activity,
  attention: Clock3,
  "chapter-ready": CheckCircle2,
  chapters: BookOpenCheck,
};

export function HomeStatusStrip(props: { metrics: HomeMetric[]; pending?: boolean }) {
  return (
    <section className="home-status-summary-grid grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="创作状态摘要">
      {props.metrics.map((metric) => {
        const Icon = metricIcons[metric.id] ?? Activity;
        return (
          <div key={metric.id} className="home-status-metric-card flex min-h-28 items-start gap-3 rounded-2xl border border-border/65 bg-card p-4 shadow-[0_16px_40px_-36px_rgba(15,23,42,0.45)]">
            <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", toneSurfaceClass(metric.tone), toneTextClass(metric.tone))}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-medium text-muted-foreground">{metric.title}</div>
              <div className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{props.pending ? "--" : metric.value}</div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{metric.hint}</p>
            </div>
          </div>
        );
      })}
    </section>
  );
}
