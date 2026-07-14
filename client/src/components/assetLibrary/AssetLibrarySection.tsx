import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { AssetLibraryTone } from "./AssetLibraryStatusGrid";

const recommendationToneClass: Record<AssetLibraryTone, string> = {
  neutral: "border-border/70 bg-muted/20",
  info: "border-info/20 bg-info/5",
  success: "border-success/20 bg-success/5",
  warning: "border-warning/25 bg-warning/5",
  danger: "border-destructive/20 bg-destructive/5",
};

export function AssetLibraryRecommendation(props: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: AssetLibraryTone;
}) {
  const Icon = props.icon;
  return (
    <section
      aria-label="推荐下一步"
      className={cn(
        "flex flex-col gap-4 rounded-md border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        recommendationToneClass[props.tone ?? "info"],
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{props.title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{props.description}</p>
        </div>
      </div>
      {props.action ? <div className="mobile-full-actions shrink-0">{props.action}</div> : null}
    </section>
  );
}

export function AssetLibrarySection(props: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-md border border-border/80 bg-card", props.className)}>
      <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div>
          <h2 className="text-base font-semibold tracking-normal text-foreground">{props.title}</h2>
          {props.description ? (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{props.description}</p>
          ) : null}
        </div>
        {props.actions ? <div className="mobile-full-actions shrink-0">{props.actions}</div> : null}
      </div>
      <div className="p-4 sm:p-5">{props.children}</div>
    </section>
  );
}

export function AssetLibraryEmptyState(props: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <div className="rounded-md border border-dashed border-border px-5 py-8 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-muted/55 text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-foreground">{props.title}</h3>
      <p className="mx-auto mt-1 max-w-xl text-sm leading-6 text-muted-foreground">{props.description}</p>
      {props.action ? <div className="mt-4 flex justify-center">{props.action}</div> : null}
    </div>
  );
}
