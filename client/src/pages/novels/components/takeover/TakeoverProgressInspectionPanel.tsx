import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { TakeoverProgressInspectionViewModel } from "../novelExistingProjectTakeoverViewModel";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

interface TakeoverProgressInspectionPanelProps {
  inspection: TakeoverProgressInspectionViewModel;
  isLoadingTaskSnapshot: boolean;
  hasTaskSnapshotError: boolean;
}

export default function TakeoverProgressInspectionPanel({
  inspection,
  isLoadingTaskSnapshot,
  hasTaskSnapshotError,
}: TakeoverProgressInspectionPanelProps) {
  return (
    <div className="mt-3 rounded-lg border bg-background/70 p-3">
      <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
        {isLoadingTaskSnapshot ? t("gen.pages.novels.components.takeover.TakeoverProgressInspectionPanel.gen_a6cccc7c") : inspection.summary}
      </div>
      <div className="mt-3 grid min-w-0 gap-2 md:grid-cols-2">
        {inspection.cards.map((card) => (
          <div key={card.title} className="min-w-0 rounded-md border bg-muted/10 p-3">
            <div className="text-xs text-muted-foreground">{card.title}</div>
            <div className="mt-1 text-sm font-medium text-foreground">{card.status}</div>
            <div className={`mt-1 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              {card.detail}
            </div>
          </div>
        ))}
      </div>
      {hasTaskSnapshotError ? (
        <div className={`mt-2 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
          当前任务详细进度读取失败，已先显示项目资产体检。
        </div>
      ) : null}
    </div>
  );
}
