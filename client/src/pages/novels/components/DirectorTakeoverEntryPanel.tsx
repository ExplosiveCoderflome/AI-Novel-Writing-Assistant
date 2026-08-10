import i18next from "i18next";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

interface DirectorTakeoverEntryPanelProps {
  title: string;
  description: string;
  entry?: ReactNode;
}

export default function DirectorTakeoverEntryPanel({
  title,
  description,
  entry,
}: DirectorTakeoverEntryPanelProps) {
  const { t } = useTranslation();
  if (!entry) {
    return null;
  }

  return (
    <section className="border-t border-primary/20 pt-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="text-base font-semibold text-foreground">{title}</div>
          <div className="text-sm leading-6 text-muted-foreground">{description}</div>
        </div>
        <div className="shrink-0">{entry}</div>
      </div>
      <div className="mt-2 text-xs leading-5 text-muted-foreground">{i18next.t("novels.directorTakeoverEntryPanel.usqxyq")}</div>
    </section>
  );
}
