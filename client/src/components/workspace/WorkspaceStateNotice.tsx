import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CircleAlert, Info, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  workspaceToneSurfaceClass,
  workspaceToneTextClass,
  type WorkspaceTone,
} from "./workspaceTone";

interface WorkspaceStateNoticeProps {
  title: string;
  description: string;
  tone?: WorkspaceTone;
  icon?: LucideIcon;
  action?: ReactNode;
  loading?: boolean;
  compact?: boolean;
  className?: string;
}

export default function WorkspaceStateNotice(props: WorkspaceStateNoticeProps) {
  const tone = props.tone ?? "neutral";
  const Icon = props.loading ? Loader2 : props.icon ?? (tone === "danger" || tone === "warning" ? CircleAlert : Info);

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-md border",
        props.compact ? "px-3 py-2" : "px-4 py-4",
        workspaceToneSurfaceClass[tone],
        props.className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", workspaceToneTextClass[tone], props.loading && "animate-spin")} aria-hidden="true" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">{props.title}</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">{props.description}</div>
          </div>
        </div>
        {props.action ? <div className="mobile-full-actions shrink-0">{props.action}</div> : null}
      </div>
    </div>
  );
}
