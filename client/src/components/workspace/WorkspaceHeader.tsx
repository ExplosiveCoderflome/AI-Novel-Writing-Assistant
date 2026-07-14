import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface WorkspaceHeaderProps {
  title: string;
  description: string;
  context?: string;
  icon?: LucideIcon;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export default function WorkspaceHeader(props: WorkspaceHeaderProps) {
  const Icon = props.icon;

  return (
    <header className={cn("border-b border-border/80 pb-5", props.className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/80 bg-muted/35 text-foreground">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
          ) : null}
          <div className="min-w-0">
            {props.context ? <p className="mb-1 text-xs font-medium text-muted-foreground">{props.context}</p> : null}
            <h1 className="text-2xl font-semibold leading-tight tracking-normal text-foreground">{props.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{props.description}</p>
            {props.meta ? <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{props.meta}</div> : null}
          </div>
        </div>
        {props.actions ? <div className="mobile-full-actions flex shrink-0 flex-wrap gap-2 lg:justify-end">{props.actions}</div> : null}
      </div>
    </header>
  );
}
