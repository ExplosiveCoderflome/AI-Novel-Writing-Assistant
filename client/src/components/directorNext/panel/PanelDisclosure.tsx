import type { ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";

export default function PanelDisclosure({ icon: Icon, title, value, children, onOpenChange }: {
  icon: LucideIcon;
  title: string;
  value?: string;
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <details className="group/disclosure min-w-0" onToggle={onOpenChange && (event => onOpenChange(event.currentTarget.open))}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-sm text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className="mr-auto shrink-0">{title}</span>
        {value && <span className="truncate text-xs font-normal" title={value}>{value}</span>}
        <ChevronRight className="size-4 shrink-0 group-open/disclosure:rotate-90" aria-hidden="true" />
      </summary>
      <div className="min-w-0 pb-4 pt-1">{children}</div>
    </details>
  );
}
