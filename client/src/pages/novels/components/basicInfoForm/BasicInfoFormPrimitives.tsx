import type { ReactNode } from "react";
import type { BasicInfoOption } from "../../novelBasicInfo.shared";

export function HelpHint({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-muted-foreground/30 text-[11px] font-semibold text-muted-foreground transition hover:border-primary hover:text-primary"
      title={text}
      aria-label={text}
    >
      ?
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
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
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
      className={`rounded-xl border p-3 text-left transition ${
        selected
          ? "border-primary bg-primary/8 shadow-sm"
          : "border-border/70 bg-background hover:border-primary/40 hover:bg-primary/5"
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
