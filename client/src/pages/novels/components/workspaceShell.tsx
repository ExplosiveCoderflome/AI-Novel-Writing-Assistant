import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type ShellTone = "neutral" | "info" | "success" | "warning" | "danger";

const toneSurfaceClass: Record<ShellTone, string> = {
  neutral: "bg-muted/20",
  info: "bg-sky-50/70 text-sky-950",
  success: "bg-emerald-50/70 text-emerald-950",
  warning: "bg-amber-50/75 text-amber-950",
  danger: "bg-destructive/5 text-destructive",
};

const toneDotClass: Record<ShellTone, string> = {
  neutral: "bg-muted-foreground/45",
  info: "bg-sky-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-destructive",
};

export function StepHero(props: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  tone?: ShellTone;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl px-5 py-4", toneSurfaceClass[props.tone ?? "neutral"], props.className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {props.eyebrow ? (
            <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
              {props.eyebrow}
            </div>
          ) : null}
          <h1 className="truncate text-xl font-semibold tracking-normal text-foreground">{props.title}</h1>
          {props.description ? (
            <div className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">{props.description}</div>
          ) : null}
          {props.meta ? (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {props.meta}
            </div>
          ) : null}
        </div>
        {props.actions ? <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">{props.actions}</div> : null}
      </div>
      {props.children ? <div className="mt-4">{props.children}</div> : null}
    </section>
  );
}

export function StepActionBar(props: {
  label?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: ShellTone;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-2xl px-4 py-3 sm:flex-row sm:items-center sm:justify-between", toneSurfaceClass[props.tone ?? "neutral"], props.className)}>
      <div className="min-w-0">
        {props.label ? <div className="text-sm font-medium text-foreground">{props.label}</div> : null}
        {props.description ? <div className="mt-1 text-sm leading-6 text-muted-foreground">{props.description}</div> : null}
      </div>
      {props.actions ? <div className="flex shrink-0 flex-wrap gap-2">{props.actions}</div> : null}
    </div>
  );
}

export function SectionBlock(props: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  surface?: boolean;
}) {
  return (
    <section className={cn("space-y-4", props.surface && "rounded-2xl bg-muted/15 p-4", props.className)}>
      {(props.title || props.description || props.actions) ? (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            {props.title ? <div className="text-lg font-semibold leading-7 text-foreground">{props.title}</div> : null}
            {props.description ? <div className="mt-1 text-sm leading-6 text-muted-foreground">{props.description}</div> : null}
          </div>
          {props.actions ? <div className="flex shrink-0 flex-wrap gap-2">{props.actions}</div> : null}
        </div>
      ) : null}
      <div className={props.contentClassName}>{props.children}</div>
    </section>
  );
}

export function DetailDisclosure(props: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details className={cn("group border-t border-border/60 pt-4", props.className)} open={props.defaultOpen}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-foreground">{props.title}</span>
          {props.description ? (
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">{props.description}</span>
          ) : null}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {props.meta}
          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
        </span>
      </summary>
      <div className="mt-4">{props.children}</div>
    </details>
  );
}

export function StatusRail(props: {
  items: Array<{
    label: ReactNode;
    value: ReactNode;
    description?: ReactNode;
    tone?: ShellTone;
  }>;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-3", props.className)}>
      {props.items.map((item, index) => (
        <div key={index} className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className={cn("h-1.5 w-1.5 rounded-full", toneDotClass[item.tone ?? "neutral"])} />
            {item.label}
          </div>
          <div className="mt-2 break-words text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{item.value}</div>
          {item.description ? <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</div> : null}
        </div>
      ))}
    </div>
  );
}
