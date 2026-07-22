import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export function SectionHeader({
  icon: Icon,
  title,
  description,
  count,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-base font-semibold">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </div>
        <div className="mt-1 text-sm leading-6 text-muted-foreground">{description}</div>
      </div>
      {typeof count === "number" ? <Badge variant="secondary">{count} 条</Badge> : null}
    </div>
  );
}

export function HandbookTextarea(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  minRows?: number;
}) {
  return (
    <textarea
      className="min-h-[96px] w-full rounded-md border bg-background p-3 text-sm leading-6"
      style={{ minHeight: `${(props.minRows ?? 4) * 24 + 24}px` }}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder}
    />
  );
}

export function HandbookField({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block rounded-md border bg-background p-3">
      <span className="block text-sm font-medium text-foreground">{title}</span>
      {hint ? <span className="mt-1 block text-xs leading-5 text-muted-foreground">{hint}</span> : null}
      <span className="mt-3 block">{children}</span>
    </label>
  );
}

export function HandbookPreviewCard({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
            {title}
          </div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
        </div>
        {action ? <div className="flex flex-none flex-wrap gap-2">{action}</div> : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function HandbookPreviewLine({
  label,
  value,
  fallback,
}: {
  label: string;
  value?: string | null;
  fallback: string;
}) {
  const text = value?.trim() || fallback;

  return (
    <div className="rounded-md bg-muted/30 p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm leading-6 text-foreground">{text}</div>
    </div>
  );
}
