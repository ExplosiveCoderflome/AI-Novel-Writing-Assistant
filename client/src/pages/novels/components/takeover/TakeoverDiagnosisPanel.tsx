import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, CircleCheck } from "lucide-react";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";
import type {
  TakeoverChapterTargetViewModel,
  TakeoverContinuousTargetViewModel,
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
  continuousTarget: TakeoverContinuousTargetViewModel | null;
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
  continuousTarget,
  isAdvancedOpen,
  isStarting,
  startDisabled,
  onEnterCurrentTask,
  onChapterTargetChange,
  onStart,
}: TakeoverDiagnosisPanelProps) {
  const quickActionLabel = !isAdvancedOpen && continuousTarget
    ? continuousTarget.actionLabel
    : chapterTarget && !isAdvancedOpen
      ? chapterTarget.actionLabel
      : guidance.actionLabel;
  return (
    <section className="min-w-0 rounded-xl bg-muted/45 p-3 sm:p-4">
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.42fr)] lg:items-start">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <CircleCheck className="h-4 w-4 text-primary" />
              建议的接续方式
            </div>
            {isLoadingReadiness ? <Badge variant="outline">正在读取进度</Badge> : null}
          </div>
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
        <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-background/85 p-3">
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
              {!isAdvancedOpen && continuousTarget ? (
                <>
                  <div className={`rounded-lg bg-background/70 p-3 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                    {continuousTarget.summary}
                  </div>
                  {chapterTarget ? (
                    <TakeoverChapterTargetSelector
                      target={chapterTarget}
                      disabled={isStarting}
                      onChange={onChapterTargetChange}
                    />
                  ) : null}
                </>
              ) : !isAdvancedOpen && chapterTarget ? (
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
                {isStarting ? "启动中..." : <><ArrowRight className="h-4 w-4" /> {quickActionLabel}</>}
              </Button>
            </>
          )}
          <div className={`border-t border-border/70 pt-2 text-xs leading-5 text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            默认保留已有资产，仅在高级设置选择重跑时才会重建对应步骤。
          </div>
        </div>
      </div>
    </section>
  );
}
