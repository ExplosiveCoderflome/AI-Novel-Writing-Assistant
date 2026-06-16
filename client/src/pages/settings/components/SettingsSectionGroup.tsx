import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

export type SettingsSectionStatus = "required" | "enhancement" | "advanced" | "maintenance";

const STATUS_LABELS: Record<SettingsSectionStatus, string> = {
  required: "开始创作必需",
  enhancement: "写作质量增强",
  advanced: "自动导演高级",
  maintenance: "系统维护",
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
