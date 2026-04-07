import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleSummaryProps {
  title: string;
  description: string;
  meta?: ReactNode;
  className?: string;
  collapsedLabel?: string;
  expandedLabel?: string;
}

export default function CollapsibleSummary(props: CollapsibleSummaryProps) {
  const {
    title,
    description,
    meta,
    className,
    collapsedLabel = "展开查看",
    expandedLabel = "收起内容",
  } = props;

  return (
    <div className={cn("flex flex-col gap-2 md:flex-row md:items-center md:justify-between", className)}>
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-1 text-xs leading-6 text-muted-foreground">{description}</div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
        <span className="group-open:hidden">{collapsedLabel}</span>
        <span className="hidden group-open:inline">{expandedLabel}</span>
        <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
      </div>
    </div>
  );
}
