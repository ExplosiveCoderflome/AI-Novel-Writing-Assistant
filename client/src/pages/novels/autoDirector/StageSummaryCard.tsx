import { motion, useReducedMotion } from "framer-motion";
import type { AutoDirectorCreateStageKey } from "./directorCreateStages";

interface StageSummaryCardProps {
  order: number;
  label: string;
  summary: string;
  active: boolean;
  completed: boolean;
  disabled?: boolean;
  onClick: (stage: AutoDirectorCreateStageKey) => void;
  stageKey: AutoDirectorCreateStageKey;
}

export default function StageSummaryCard({
  order,
  label,
  summary,
  active,
  completed,
  disabled = false,
  onClick,
  stageKey,
}: StageSummaryCardProps) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      layout={!reducedMotion}
      whileHover={disabled || reducedMotion ? undefined : { y: -1 }}
      transition={{ duration: reducedMotion ? 0 : 0.18 }}
      disabled={disabled}
      onClick={() => onClick(stageKey)}
      title={summary}
      className={`group inline-flex min-w-0 items-center gap-2 rounded-full px-2.5 py-1.5 text-left transition ${
        active
          ? "bg-foreground text-background shadow-sm"
          : completed
            ? "bg-muted/70 text-foreground hover:bg-muted"
            : "text-muted-foreground/65"
      } ${disabled ? "cursor-not-allowed" : ""}`}
    >
      <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
        active
          ? "bg-background text-foreground"
          : completed
            ? "bg-background text-foreground"
            : "bg-muted text-muted-foreground"
      }`}>
        {order}
      </span>
      <span className="shrink-0 text-sm font-medium">{label}</span>
      <span className={`hidden min-w-0 max-w-[13rem] truncate text-xs lg:inline ${
        active ? "text-background/70" : "text-muted-foreground"
      }`}>
        {summary}
      </span>
    </motion.button>
  );
}
