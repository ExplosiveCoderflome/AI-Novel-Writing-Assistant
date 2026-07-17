import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AssetLibraryTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface AssetLibraryStatusItem {
  key: string;
  label: string;
  value: string | number;
  detail?: string;
  icon?: LucideIcon;
  tone?: AssetLibraryTone;
}

const toneClass: Record<AssetLibraryTone, string> = {
  neutral: "border-border/70 bg-muted/20 text-foreground",
  info: "border-info/20 bg-info/5 text-info",
  success: "border-success/20 bg-success/5 text-success",
  warning: "border-warning/25 bg-warning/5 text-warning",
  danger: "border-destructive/20 bg-destructive/5 text-destructive",
};

export default function AssetLibraryStatusGrid(props: { items: AssetLibraryStatusItem[] }) {
  return (
    <section aria-label="资产状态" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {props.items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.key}
            className={cn("rounded-md border px-4 py-3", toneClass[item.tone ?? "neutral"])}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
              {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
            </div>
            <div className="mt-2 text-xl font-semibold leading-none text-current">{item.value}</div>
            {item.detail ? (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail}</p>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
