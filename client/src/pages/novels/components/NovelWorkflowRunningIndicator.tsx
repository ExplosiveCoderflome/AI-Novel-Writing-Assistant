import WorkflowProgressBar, { normalizeProgressPercent } from "@/components/workflow/WorkflowProgressBar";
import { cn } from "@/lib/utils";

interface NovelWorkflowRunningIndicatorProps {
  progress: number;
  className?: string;
  label?: string;
}

export default function NovelWorkflowRunningIndicator(props: NovelWorkflowRunningIndicatorProps) {
  const {
    progress,
    className,
    label = "AI 正在后台持续推进",
  } = props;
  const percent = normalizeProgressPercent(progress);

  return (
    <div className={cn("rounded-lg border border-primary/15 bg-primary/[0.05] px-3 py-2.5", className)}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex min-w-0 items-center gap-2 font-medium text-foreground">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/40" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
          <span className="truncate">{label}</span>
        </div>
        <span className="shrink-0 tabular-nums text-muted-foreground">{percent}%</span>
      </div>

      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-primary/10">
        <WorkflowProgressBar progress={percent} tone="running" className="h-full bg-transparent" />
      </div>
    </div>
  );
}
