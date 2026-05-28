import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";
import type {
  TakeoverChapterTargetViewModel,
  TakeoverGuidanceViewModel,
  TakeoverProgressInspectionViewModel,
} from "../novelExistingProjectTakeoverViewModel";
import TakeoverChapterTargetSelector from "./TakeoverChapterTargetSelector";
import TakeoverProgressInspectionPanel from "./TakeoverProgressInspectionPanel";

interface TakeoverDiagnosisPanelProps {
  guidance: TakeoverGuidanceViewModel;
  inspection: TakeoverProgressInspectionViewModel;
  isLoadingReadiness: boolean;
  readinessErrorMessage?: string | null;
  isLoadingTaskSnapshot: boolean;
  hasTaskSnapshotError: boolean;
  hasCurrentTask: boolean;
  chapterTarget: TakeoverChapterTargetViewModel | null;
  isAdvancedOpen: boolean;
  isStarting: boolean;
  startDisabled: boolean;
  onEnterCurrentTask: () => void;
  onChapterTargetChange: (order: number) => void;
  onStart: () => void;
}

export default function TakeoverDiagnosisPanel({
  guidance,
  inspection,
  isLoadingReadiness,
  readinessErrorMessage,
  isLoadingTaskSnapshot,
  hasTaskSnapshotError,
  hasCurrentTask,
  chapterTarget,
  isAdvancedOpen,
  isStarting,
  startDisabled,
  onEnterCurrentTask,
  onChapterTargetChange,
  onStart,
}: TakeoverDiagnosisPanelProps) {
  const quickActionLabel = chapterTarget && !isAdvancedOpen ? chapterTarget.actionLabel : guidance.actionLabel;
  return (
    <div className="min-w-0 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="text-sm font-medium text-foreground">接续诊断</div>
          {isLoadingReadiness ? <Badge variant="outline">读取项目进度</Badge> : null}
          {readinessErrorMessage ? (
            <div className={`rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
              {readinessErrorMessage}
            </div>
          ) : (
            <>
              <div className={`text-sm leading-6 text-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                {guidance.diagnosis}
              </div>
              <div className={`text-sm leading-6 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                {guidance.nextStep}
              </div>
              <div className="flex min-w-0 flex-wrap gap-2">
                {guidance.protectionNotes.map((note) => (
                  <Badge
                    key={note}
                    variant={guidance.riskLevel === "safe" ? "secondary" : "outline"}
                    className="max-w-full whitespace-normal break-words text-left [overflow-wrap:anywhere]"
                  >
                    {note}
                  </Badge>
                ))}
              </div>
              <TakeoverProgressInspectionPanel
                inspection={inspection}
                isLoadingTaskSnapshot={isLoadingTaskSnapshot}
                hasTaskSnapshotError={hasTaskSnapshotError}
              />
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:min-w-48">
          {hasCurrentTask ? (
            <Button
              type="button"
              variant="outline"
              className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}
              onClick={onEnterCurrentTask}
            >
              进入当前任务
            </Button>
          ) : (
            <>
              {!isAdvancedOpen && chapterTarget ? (
                <TakeoverChapterTargetSelector
                  target={chapterTarget}
                  disabled={isStarting}
                  onChange={onChapterTargetChange}
                />
              ) : null}
              <Button
                type="button"
                className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction}
                disabled={startDisabled}
                onClick={onStart}
              >
                {isStarting ? "启动中..." : quickActionLabel}
              </Button>
            </>
          )}
          <div className={`text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            默认保留已有资产，仅在高级设置选择重跑时才会重建对应步骤。
          </div>
        </div>
      </div>
    </div>
  );
}
