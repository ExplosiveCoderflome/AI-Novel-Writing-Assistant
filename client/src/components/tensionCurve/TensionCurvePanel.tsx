import { useMemo, useState, type PointerEvent } from "react";
import { LockKeyhole, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface TensionCurvePoint {
  id: string;
  chapterOrder: number;
  title: string;
  value: number | null;
  source?: "ai" | "user" | null;
  beatKey?: string | null;
}

export interface TensionCurveSeries {
  id: string;
  label: string;
  color: string;
  points: TensionCurvePoint[];
  editable?: boolean;
}

export interface TensionCurveViewportOption {
  key: string;
  label: string;
}

interface TensionCurvePanelProps {
  title: string;
  subtitle?: string;
  series: TensionCurveSeries[];
  viewportOptions?: TensionCurveViewportOption[];
  selectedViewportKey?: string;
  onViewportChange?: (key: string) => void;
  readonly?: boolean;
  compact?: boolean;
  onPointChange?: (seriesId: string, pointId: string, value: number) => void;
}

const WIDTH = 720;
const HEIGHT = 240;
const PADDING = {
  left: 44,
  right: 24,
  top: 20,
  bottom: 34,
};

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function pointX(index: number, count: number): number {
  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  if (count <= 1) {
    return PADDING.left + innerWidth / 2;
  }
  return PADDING.left + (innerWidth * index) / (count - 1);
}

function pointY(value: number): number {
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  return PADDING.top + innerHeight * (1 - value / 100);
}

function valueFromPointer(clientY: number, svg: SVGSVGElement): number {
  const rect = svg.getBoundingClientRect();
  const ratio = (clientY - rect.top) / rect.height;
  const y = ratio * HEIGHT;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;
  return clampScore(100 - ((y - PADDING.top) / innerHeight) * 100);
}

function buildPolylineSegments(points: TensionCurvePoint[]): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  points.forEach((point, index) => {
    if (typeof point.value !== "number") {
      if (current.length > 1) {
        segments.push(current.join(" "));
      }
      current = [];
      return;
    }
    current.push(`${pointX(index, points.length)},${pointY(point.value)}`);
  });
  if (current.length > 1) {
    segments.push(current.join(" "));
  }
  return segments;
}

export default function TensionCurvePanel(props: TensionCurvePanelProps) {
  const {
    title,
    subtitle,
    series,
    viewportOptions = [],
    selectedViewportKey = "all",
    onViewportChange,
    readonly = false,
    compact = false,
    onPointChange,
  } = props;
  const [activePoint, setActivePoint] = useState<{ seriesId: string; pointId: string } | null>(null);

  const filteredSeries = useMemo(() => series.map((item) => ({
    ...item,
    points: selectedViewportKey === "all"
      ? item.points
      : item.points.filter((point) => point.beatKey === selectedViewportKey),
  })), [selectedViewportKey, series]);
  const primaryPoints = filteredSeries[0]?.points ?? [];
  const editable = !readonly && Boolean(onPointChange);
  const userAnchorCount = primaryPoints.filter((point) => point.source === "user").length;

  function updateActivePoint(event: PointerEvent<SVGSVGElement>) {
    if (!activePoint || !onPointChange) {
      return;
    }
    onPointChange(activePoint.seriesId, activePoint.pointId, valueFromPointer(event.clientY, event.currentTarget));
  }

  return (
    <Card className={cn("border-border/70 bg-background/95", compact ? "rounded-lg" : "rounded-xl")}>
      <CardHeader className={cn("pb-3", compact ? "space-y-2" : "space-y-3")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className={cn("leading-none", compact ? "text-sm" : "text-base")}>{title}</CardTitle>
              {readonly ? <Badge variant="outline">只读</Badge> : null}
              {userAnchorCount > 0 ? <Badge variant="secondary">{userAnchorCount} 个锚定点</Badge> : null}
            </div>
            {subtitle ? <div className="text-xs leading-5 text-muted-foreground">{subtitle}</div> : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {viewportOptions.map((option) => (
              <Button
                key={option.key}
                type="button"
                size="sm"
                variant={selectedViewportKey === option.key ? "secondary" : "outline"}
                className="h-8 px-2 text-xs"
                onClick={() => onViewportChange?.(option.key)}
              >
                {option.key === "all" ? <SlidersHorizontal className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> : null}
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn("space-y-3", compact ? "pt-0" : "pt-0")}>
        <div className={cn("w-full overflow-hidden rounded-lg border border-border/70 bg-muted/10", compact ? "h-40" : "h-64")}>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-full w-full touch-none"
            role="img"
            aria-label={title}
            onPointerMove={updateActivePoint}
            onPointerUp={() => setActivePoint(null)}
            onPointerCancel={() => setActivePoint(null)}
            onPointerLeave={() => setActivePoint(null)}
          >
            {[0, 25, 50, 75, 100].map((tick) => (
              <g key={tick}>
                <line
                  x1={PADDING.left}
                  x2={WIDTH - PADDING.right}
                  y1={pointY(tick)}
                  y2={pointY(tick)}
                  stroke="hsl(var(--border))"
                  strokeDasharray={tick === 0 ? undefined : "4 6"}
                  strokeWidth="1"
                />
                <text x="12" y={pointY(tick) + 4} className="fill-muted-foreground text-[11px]">
                  {tick}
                </text>
              </g>
            ))}

            {filteredSeries.map((item) => (
              <g key={item.id}>
                {buildPolylineSegments(item.points).map((segment, index) => (
                  <polyline
                    key={`${item.id}-${index}`}
                    points={segment}
                    fill="none"
                    stroke={item.color}
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
                {item.points.map((point, index) => {
                  const value = point.value;
                  const hasValue = typeof value === "number";
                  const x = pointX(index, item.points.length);
                  const y = pointY(hasValue ? value : 0);
                  const userAnchored = point.source === "user";
                  return (
                    <g key={point.id}>
                      <line
                        x1={x}
                        x2={x}
                        y1={PADDING.top}
                        y2={HEIGHT - PADDING.bottom}
                        stroke="hsl(var(--border))"
                        strokeWidth="0.5"
                        opacity="0.28"
                      />
                      <circle
                        cx={x}
                        cy={hasValue ? y : HEIGHT - PADDING.bottom}
                        r={userAnchored ? 7 : 5.5}
                        fill={hasValue ? (userAnchored ? "#e11d48" : item.color) : "#94a3b8"}
                        stroke="white"
                        strokeWidth="2"
                        className={cn(editable && item.editable !== false ? "cursor-ns-resize" : "cursor-default")}
                        onPointerDown={(event) => {
                          if (!editable || item.editable === false) {
                            return;
                          }
                          event.currentTarget.setPointerCapture(event.pointerId);
                          setActivePoint({ seriesId: item.id, pointId: point.id });
                          onPointChange?.(item.id, point.id, valueFromPointer(event.clientY, event.currentTarget.ownerSVGElement!));
                        }}
                      >
                        <title>
                          {`第${point.chapterOrder}章 ${point.title}：${hasValue ? value : "未设置"}${userAnchored ? "，用户锚定" : ""}`}
                        </title>
                      </circle>
                      <text
                        x={x}
                        y={HEIGHT - 10}
                        textAnchor="middle"
                        className="fill-muted-foreground text-[10px]"
                      >
                        {point.chapterOrder}
                      </text>
                    </g>
                  );
                })}
              </g>
            ))}
          </svg>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {filteredSeries.map((item) => (
            <span key={item.id} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-600" />
            用户锚定
          </span>
          {readonly ? (
            <span className="inline-flex items-center gap-1.5">
              <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />
              当前视图不会改动草稿
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
