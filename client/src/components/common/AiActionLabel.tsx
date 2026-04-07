import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AiActionLabelProps {
  children: ReactNode;
  className?: string;
  badgeClassName?: string;
}

export default function AiActionLabel(props: AiActionLabelProps) {
  const { children, className, badgeClassName } = props;

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-5 min-w-[1.7rem] shrink-0 items-center justify-center rounded-md border border-current/15 bg-current/10 px-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] leading-none text-current opacity-90",
          badgeClassName,
        )}
      >
        AI
      </span>
      <span className="leading-none">{children}</span>
    </span>
  );
}
