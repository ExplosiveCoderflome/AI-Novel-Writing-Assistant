import { useMemo, useState } from "react";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  analyzeTensionCurveShape,
  buildReferenceCurveValues,
  tensionCurveReferenceTemplates,
} from "./tensionCurveAnalysis";
import { chartWidth, selectedScopeMatches } from "./curveCoordinates";
import { TensionCurveFlowCanvas } from "./TensionCurveFlowCanvas";
import { CompactLegend } from "./TensionCurveNodes";
import {
  TensionCurveBeatContextStrip,
  type TensionCurveBeatContext,
} from "./TensionCurveBeatContextStrip";
import {
  TensionCurveChapterDetailSidebar,
  type TensionCurveChapterContext,
} from "./TensionCurveChapterDetailSidebar";
import {
  TensionCurveVolumeContextBar,
  type TensionCurveVolumeContext,
} from "./TensionCurveVolumeContextBar";
import type {
  TensionCurveSeries,
  TensionCurveViewportOption,
} from "./tensionCurveTypes";

interface TensionCurveEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  series: TensionCurveSeries[];
  viewportOptions?: TensionCurveViewportOption[];
  selectedViewportKey?: string;
  onViewportChange?: (key: string) => void;
  strategyVolume?: TensionCurveVolumeContext | null;
  beats?: TensionCurveBeatContext[];
  chapters?: TensionCurveChapterContext[];
  selectedChapterId?: string;
  onSelectChapter?: (chapterId: string) => void;
  onOpenChapterDetail?: (chapterId: string) => void;
  onPointChange: (seriesId: string, pointId: string, value: number) => void;
  onPointRelease: (seriesId: string, pointId: string, value: number) => void;
  onPointReleaseMany: (seriesId: string, points: Array<{ pointId: string; value: number }>) => void;
}

export function TensionCurveEditDialog(props: TensionCurveEditDialogProps) {
  const {
    open,
    onOpenChange,
    title,
    description,
    series,
    selectedViewportKey = "all",
    onViewportChange,
    strategyVolume,
    beats = [],
    chapters = [],
    selectedChapterId,
    onSelectChapter,
    onOpenChapterDetail,
    onPointChange,
    onPointRelease,
    onPointReleaseMany,
  } = props;
  const [showReferenceCurve, setShowReferenceCurve] = useState(false);
  const [referenceTemplateKey, setReferenceTemplateKey] = useState(tensionCurveReferenceTemplates[0]?.key ?? "escalation");

  const primarySeries = series[0] ?? null;
  const primaryPoints = primarySeries?.points ?? [];
  const primaryPointCount = primaryPoints.length;
  const canvasWidth = chartWidth(primaryPointCount);
  const userAnchorCount = primaryPoints.filter((point) => point.source === "user").length;
  const selectedUserAnchorCount = primaryPoints.filter((point) => (
    point.source === "user" && selectedScopeMatches(point, selectedViewportKey)
  )).length;
  const shapeHints = useMemo(() => analyzeTensionCurveShape(primaryPoints), [primaryPoints]);
  const referenceTemplate = tensionCurveReferenceTemplates.find((template) => template.key === referenceTemplateKey)
    ?? tensionCurveReferenceTemplates[0];
  const referenceValues = useMemo(
    () => referenceTemplate ? buildReferenceCurveValues(referenceTemplate, primaryPointCount) : [],
    [primaryPointCount, referenceTemplate],
  );
  const selectedChapter = selectedChapterId
    ? chapters.find((chapter) => chapter.id === selectedChapterId || chapter.chapterId === selectedChapterId) ?? null
    : null;
  const selectedBeatLabel = selectedChapter?.beatKey
    ? beats.find((beat) => beat.key === selectedChapter.beatKey)?.label ?? null
    : null;

  function releaseScope(scope: "all" | "selected") {
    if (!primarySeries) {
      return;
    }
    const points = primarySeries.points
      .filter((point) => point.source === "user" && typeof point.value === "number")
      .filter((point) => scope === "all" || selectedScopeMatches(point, selectedViewportKey))
      .map((point) => ({ pointId: point.id, value: point.value as number }));
    if (points.length > 0) {
      onPointReleaseMany(primarySeries.id, points);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        title={title}
        description={description}
        className="max-w-[min(1280px,calc(100vw-1.5rem))]"
        bodyClassName="space-y-4 bg-muted/10"
        footerClassName="items-center justify-between gap-3 sm:space-x-0"
        footer={(
          <>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {showReferenceCurve && referenceTemplate ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-px w-5 border-t border-dashed border-slate-500" />
                  {referenceTemplate.label}参考
                </span>
              ) : null}
              {userAnchorCount > 0 ? <span>{userAnchorCount} 个手动固定点</span> : <span>暂无手动固定点</span>}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {userAnchorCount > 0 ? (
                <Button type="button" size="sm" variant="outline" onClick={() => releaseScope("all")}>
                  整卷交还 AI
                </Button>
              ) : null}
              {selectedViewportKey !== "all" && selectedUserAnchorCount > 0 ? (
                <Button type="button" size="sm" variant="outline" onClick={() => releaseScope("selected")}>
                  当前节奏段交还 AI
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="secondary" onClick={() => onOpenChange(false)}>
                完成编辑
              </Button>
            </div>
          </>
        )}
      >
        <TensionCurveVolumeContextBar volume={strategyVolume} />

        <TensionCurveBeatContextStrip
          beats={beats}
          selectedBeatKey={selectedViewportKey}
          onBeatChange={(key) => onViewportChange?.(key)}
        />

        <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background p-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="text-sm text-muted-foreground">
                拖动章节节点会固定该章强度；点选节点可在右侧查看章节摘要。
              </div>
              {primaryPointCount > 1 ? (
                <div className="flex items-center gap-2 rounded-md border border-border/70 px-2 py-1">
                  <span className="text-xs text-muted-foreground">参考线</span>
                  <Switch
                    checked={showReferenceCurve}
                    onCheckedChange={setShowReferenceCurve}
                    aria-label="显示紧张度参考线"
                    className="h-5 w-9"
                  />
                  {showReferenceCurve ? (
                    <Select value={referenceTemplateKey} onValueChange={setReferenceTemplateKey}>
                      <SelectTrigger className="h-8 w-[92px] rounded-md px-2 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {tensionCurveReferenceTemplates.map((template) => (
                          <SelectItem key={template.key} value={template.key}>
                            {template.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
              ) : null}
            </div>

            <TensionCurveFlowCanvas
              series={series}
              selectedViewportKey={selectedViewportKey}
              showReferenceCurve={showReferenceCurve}
              referenceValues={referenceValues}
              onPointChange={onPointChange}
              onPointRelease={onPointRelease}
              onPointSelect={(seriesId, pointId) => {
                if (seriesId === primarySeries?.id) {
                  onSelectChapter?.(pointId);
                }
              }}
            />

            {canvasWidth > 900 ? (
              <div className="text-xs text-muted-foreground">拖动画布或滚轮可横向浏览更多章节；拖动点时按住 Shift 可按 1 点精度调整。</div>
            ) : null}

            <CompactLegend />

            {shapeHints.length > 0 ? (
              <div className="grid gap-2 md:grid-cols-3">
                {shapeHints.map((hint) => (
                  <div key={hint.key} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <div className="font-medium">{hint.label}</div>
                    <div className="mt-1 leading-5">{hint.detail}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className={cn("min-w-0", "xl:sticky xl:top-0 xl:self-start")}>
            <TensionCurveChapterDetailSidebar
              chapter={selectedChapter}
              beatLabel={selectedBeatLabel}
              onOpenChapterDetail={
                selectedChapter
                  ? () => onOpenChapterDetail?.(selectedChapter.id)
                  : undefined
              }
            />
          </div>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
