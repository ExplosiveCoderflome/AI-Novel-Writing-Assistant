import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { useEffect, useState } from "react";
import { NodeToolbar, type NodeProps } from "@xyflow/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AXIS_LABEL_Y,
  HEIGHT,
  NULL_TRACK_Y,
  PADDING,
  PLOT_BOTTOM,
  TICKS,
  clampScore,
  createYScale,
} from "./curveCoordinates";
import type { TensionCanvasData, TensionPointData } from "./tensionCurveTypes";

export function TensionCanvasNodeComponent({ data }: NodeProps) {
  const canvasData = data as TensionCanvasData;
  const yScale = createYScale();
  return (
    <div className="pointer-events-none h-full w-full">
      <svg
        width={canvasData.width}
        height={HEIGHT}
        viewBox={`0 0 ${canvasData.width} ${HEIGHT}`}
        className="h-full w-full overflow-visible"
        aria-hidden="true"
      >
        {canvasData.bands.map((band) => (
          <g key={band.key}>
            <rect
              x={band.x}
              y={PADDING.top}
              width={band.width}
              height={PLOT_BOTTOM - PADDING.top}
              rx="8"
              fill={band.active ? "#dbeafe" : "#f8fafc"}
              opacity={band.active ? 0.78 : 0.52}
            />
          </g>
        ))}

        {canvasData.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PADDING.left}
              x2={canvasData.width - PADDING.right}
              y1={yScale(tick)}
              y2={yScale(tick)}
              stroke="hsl(var(--border))"
              strokeDasharray={tick === 0 ? undefined : "4 6"}
              strokeWidth="1"
            />
            <text x="14" y={yScale(tick) + 4} className="fill-muted-foreground text-[11px]">
              {tick}
            </text>
          </g>
        ))}

        <rect
          x={PADDING.left - 8}
          y={NULL_TRACK_Y - 15}
          width={canvasData.width - PADDING.left - PADDING.right + 16}
          height={30}
          rx="6"
          fill="#f1f5f9"
          opacity={0.6}
        />
        <line
          x1={PADDING.left}
          x2={canvasData.width - PADDING.right}
          y1={NULL_TRACK_Y}
          y2={NULL_TRACK_Y}
          stroke="#cbd5e1"
          strokeDasharray="3 7"
          strokeWidth="1"
        />
        <text x="14" y={NULL_TRACK_Y + 4} className="fill-muted-foreground text-[11px] font-medium">
          待定
        </text>

        {canvasData.guides.map((guide) => (
          <g key={guide.key}>
            <line
              x1={guide.x}
              x2={guide.x}
              y1={PADDING.top}
              y2={PLOT_BOTTOM}
              stroke={guide.emphasized ? "#93c5fd" : "hsl(var(--border))"}
              strokeWidth={guide.emphasized ? 1 : 0.5}
              opacity={guide.emphasized ? 0.65 : 0.24}
            />
            <text
              x={guide.x}
              y={AXIS_LABEL_Y}
              textAnchor="middle"
              className={cn("fill-muted-foreground", guide.emphasized ? "text-[11px] font-medium" : "text-[10px]")}
            >
              {guide.label}
            </text>
          </g>
        ))}

        {canvasData.segments.map((segment) => (
          <path
            key={segment.key}
            d={segment.path}
            fill="none"
            stroke={segment.color}
            strokeDasharray={segment.dash}
            strokeWidth={segment.dash ? 2 : 3}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={segment.opacity ?? 1}
          />
        ))}
      </svg>
    </div>
  );
}

export function TensionPointNodeComponent({ data, selected }: NodeProps) {
  const pointData = data as TensionPointData;
  const hasValue = typeof pointData.value === "number";
  const [draftValue, setDraftValue] = useState(hasValue ? String(pointData.value) : "");

  useEffect(() => {
    setDraftValue(hasValue ? String(pointData.value) : "");
  }, [hasValue, pointData.value]);

  const userAnchored = pointData.source === "user";
  const fillColor = hasValue ? (userAnchored ? "#e11d48" : pointData.color) : "#94a3b8";
  const markerSize = userAnchored ? 15 : hasValue ? 12 : 10;

  function commitDraft() {
    const parsed = Number(draftValue);
    if (!Number.isFinite(parsed)) {
      return;
    }
    pointData.onCommitValue?.(pointData.seriesId, pointData.pointId, clampScore(parsed));
  }

  return (
    <div
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full bg-transparent",
        pointData.editable && hasValue ? "cursor-ns-resize" : "cursor-default",
      )}
      title={`第${pointData.chapterOrder}章 ${pointData.title}：${hasValue ? pointData.value : t("gen.components.tensionCurve.TensionCurveNodes.gen_fe2d26a2")}${userAnchored ? t("gen.components.tensionCurve.TensionCurveNodes.gen_59a14da9") : ""}`}
      aria-label={`第${pointData.chapterOrder}章冲突强度${hasValue ? pointData.value : t("gen.components.tensionCurve.TensionCurveNodes.gen_fe2d26a2")}`}
    >
      <NodeToolbar isVisible={Boolean(selected && pointData.editable)} offset={12}>
        <div className="nodrag rounded-md border border-border/80 bg-background p-2 text-xs shadow-lg">
          <div className="mb-2 whitespace-nowrap font-medium text-foreground">
            第{pointData.chapterOrder}章
          </div>
          {hasValue ? (
            <div className="flex items-center gap-2">
              <input
                className="h-8 w-16 rounded-md border border-input bg-background px-2 text-xs"
                type="number"
                min={0}
                max={100}
                value={draftValue}
                onChange={(event) => setDraftValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commitDraft();
                  }
                }}
              />
              <Button type="button" size="sm" className="h-8 px-2 text-xs" onClick={commitDraft}>
                应用
              </Button>
              {userAnchored ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 px-2 text-xs"
                  onClick={() => pointData.onRelease?.(pointData.seriesId, pointData.pointId, pointData.value ?? 0)}
                >
                  交还 AI
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="whitespace-nowrap text-muted-foreground">{t("gen.components.tensionCurve.TensionCurveNodes.gen_3ac6a320")}</div>
          )}
        </div>
      </NodeToolbar>
      <span
        className={cn(
          "block rounded-full border-2 border-white shadow-sm",
          userAnchored ? "ring-2 ring-rose-200" : "",
          pointData.selectedScope ? "outline outline-2 outline-offset-2 outline-blue-200" : "",
          !hasValue ? "opacity-70" : "",
        )}
        style={{
          width: markerSize,
          height: markerSize,
          backgroundColor: fillColor,
        }}
      />
    </div>
  );
}

export function CompactLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border/70 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5" title={t("gen.components.tensionCurve.TensionCurveNodes.gen_46cecd90")}>
        <span className="h-[3px] w-6 rounded-full bg-blue-600" />
        当前走势
      </span>
      <span className="inline-flex items-center gap-1.5" title={t("gen.components.tensionCurve.TensionCurveNodes.gen_c3c26702")}>
        <span className="h-3 w-3 rounded-full bg-blue-600 ring-2 ring-blue-100" />
        AI 托管
      </span>
      <span className="inline-flex items-center gap-1.5" title={t("gen.components.tensionCurve.TensionCurveNodes.gen_2649545a")}>
        <span className="h-3.5 w-3.5 rounded-full bg-rose-600 ring-2 ring-rose-200" />
        手动固定
      </span>
      <span className="inline-flex items-center gap-1.5" title={t("gen.components.tensionCurve.TensionCurveNodes.gen_59a9b828")}>
        <span className="h-2.5 w-2.5 rounded-full bg-slate-400 opacity-70" />
        暂无强度
      </span>
      <span className="inline-flex items-center gap-1.5" title={t("gen.components.tensionCurve.TensionCurveNodes.gen_19d0d055")}>
        <span className="h-px w-6 border-t-2 border-dashed border-slate-500" />
        参考模板
      </span>
    </div>
  );
}
