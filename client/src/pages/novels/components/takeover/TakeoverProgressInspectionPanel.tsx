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
    <div className="mt-4 border-t border-border/70 pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="text-xs font-medium text-foreground">已检查的项目资产</div>
        <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
        {isLoadingTaskSnapshot ? "正在读取当前任务的详细进度..." : inspection.summary}
        </div>
      </div>
      <div className="mt-3 grid min-w-0 gap-2 md:grid-cols-2">
        {inspection.cards.map((card) => (
          <div key={card.title} className="min-w-0 rounded-lg bg-background/75 p-3">
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
