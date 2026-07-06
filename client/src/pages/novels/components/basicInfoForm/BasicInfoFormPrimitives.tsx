import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import type { BasicInfoOption } from "../../novelBasicInfo.shared";
import { cn } from "@/lib/utils";

export function HelpHint({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground/70 transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      title={text}
      aria-label={text}
    >
      <CircleHelp className="h-3.5 w-3.5" />
    </button>
  );
}

export function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {children}
      </label>
      {hint ? <HelpHint text={hint} /> : null}
    </div>
  );
}

export function SectionBlock({
  title,
  description,
  children,
  surface = "muted",
  className,
}: {
  title: string;
  description: string;
  children: ReactNode;
  surface?: "muted" | "none";
  className?: string;
}) {
  return (
    <section className={cn(
      "space-y-4",
      surface === "muted" ? "rounded-lg bg-muted/15 px-4 py-5" : null,
      className,
    )}>
      <div className="space-y-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-xs leading-5 text-muted-foreground">{description}</div>
      </div>
      {children}
    </section>
  );
}

export function SelectionCard<T extends string>({
  option,
  selected,
  onSelect,
}: {
  option: BasicInfoOption<T>;
  selected: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option.value)}
      className={`rounded-lg p-3 text-left transition ring-1 ${
        selected
          ? "bg-primary/8 ring-primary/35"
          : "bg-background/70 ring-border/20 hover:bg-background hover:ring-primary/25"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-foreground">{option.label}</div>
        {option.recommended ? (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
            推荐
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{option.summary}</div>
    </button>
  );
}

export function findOptionSummary<T extends string>(options: BasicInfoOption<T>[], value: T): string {
  return options.find((item) => item.value === value)?.summary ?? "";
}
