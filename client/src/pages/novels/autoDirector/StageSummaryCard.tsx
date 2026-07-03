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
      whileHover={disabled || reducedMotion ? undefined : { y: -2 }}
      transition={{ duration: reducedMotion ? 0 : 0.18 }}
      disabled={disabled}
      onClick={() => onClick(stageKey)}
      className={`min-w-0 rounded-lg border px-3 py-2 text-left transition ${
        active
          ? "border-primary bg-primary/10 shadow-sm"
          : completed
            ? "border-border bg-background hover:border-primary/40"
            : "border-border/60 bg-muted/20 opacity-70"
      } ${disabled ? "cursor-not-allowed" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          completed || active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}>
          {order}
        </span>
        <span className="truncate text-sm font-medium text-foreground">{label}</span>
      </div>
      <div className="mt-1 line-clamp-2 break-words text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
        {summary}
      </div>
    </motion.button>
  );
}

