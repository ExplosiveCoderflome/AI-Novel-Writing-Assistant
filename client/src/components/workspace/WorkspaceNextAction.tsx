import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { workspaceToneSurfaceClass, type WorkspaceTone } from "./workspaceTone";

interface WorkspaceNextActionProps {
  title: string;
  description: string;
  consequence?: string;
  action?: ReactNode;
  icon?: LucideIcon;
  tone?: WorkspaceTone;
  className?: string;
}

export default function WorkspaceNextAction(props: WorkspaceNextActionProps) {
  const Icon = props.icon ?? ArrowRight;
  return (
    <section
      aria-label="推荐下一步"
      className={cn(
        "flex flex-col gap-4 rounded-md border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        workspaceToneSurfaceClass[props.tone ?? "info"],
        props.className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{props.title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{props.description}</p>
          {props.consequence ? <p className="mt-1 text-xs leading-5 text-muted-foreground">执行后：{props.consequence}</p> : null}
        </div>
      </div>
      {props.action ? <div className="mobile-full-actions shrink-0">{props.action}</div> : null}
    </section>
  );
}
