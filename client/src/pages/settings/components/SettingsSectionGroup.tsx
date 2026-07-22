import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

export type SettingsSectionStatus = "required" | "enhancement" | "advanced" | "maintenance";

const STATUS_LABELS: Record<SettingsSectionStatus, string> = {
  required: t("gen.pages.settings.components.SettingsSectionGroup.gen_e7c25780"),
  enhancement: t("gen.pages.settings.components.SettingsSectionGroup.gen_124a0559"),
  advanced: t("gen.pages.settings.components.SettingsSectionGroup.gen_c72f1d50"),
  maintenance: t("gen.pages.settings.components.SettingsSectionGroup.gen_e58e3369"),
};

export default function SettingsSectionGroup(props: {
  title: string;
  description: string;
  status: SettingsSectionStatus;
  children: ReactNode;
}) {
  const { title, description, status, children } = props;

  return (
    <section className="min-w-0 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-normal">{title}</h2>
            <Badge variant="outline">{STATUS_LABELS[status]}</Badge>
          </div>
          <p className={`text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {description}
          </p>
        </div>
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}
