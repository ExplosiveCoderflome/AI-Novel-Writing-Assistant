import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type WorkflowProgressTone = "running" | "waiting" | "failed" | "loading" | "default";

interface WorkflowProgressBarProps {
  progress: number;
  tone?: WorkflowProgressTone;
  className?: string;
}

export function normalizeProgressPercent(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0;
  }
  const normalized = progress <= 1 ? progress * 100 : progress;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function barToneClass(tone: WorkflowProgressTone): string {
  if (tone === "loading") {
    return "bg-slate-500";
  }
  if (tone === "failed") {
    return "bg-destructive";
  }
  if (tone === "waiting") {
    return "bg-amber-500";
  }
  if (tone === "running") {
    return "bg-primary/80";
  }
  return "bg-primary";
}

function trackToneClass(tone: WorkflowProgressTone): string {
  if (tone === "failed") {
    return "bg-destructive/10";
  }
  if (tone === "waiting") {
    return "bg-amber-500/12";
  }
  if (tone === "running") {
    return "bg-primary/10";
  }
  return "bg-muted";
}

export default function WorkflowProgressBar(props: WorkflowProgressBarProps) {
  const {
    progress,
    tone = "default",
    className,
  } = props;
  const percent = normalizeProgressPercent(progress);
  const animateSweep = tone === "running";

  return (
    <div className={cn("h-2.5 overflow-hidden rounded-full", trackToneClass(tone), className)}>
      <div
        className={cn(
          "relative h-full rounded-full transition-[width] duration-700 ease-out",
          barToneClass(tone),
        )}
        style={{
          width: `${percent}%`,
          minWidth: percent > 0 ? undefined : "0.75rem",
        }}
      >
        {animateSweep ? (
          <motion.div
            aria-hidden="true"
            className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/65 to-transparent"
            animate={{ x: ["-120%", "380%"] }}
            transition={{ duration: 1.8, ease: "linear", repeat: Number.POSITIVE_INFINITY }}
          />
        ) : null}
      </div>
    </div>
  );
}
