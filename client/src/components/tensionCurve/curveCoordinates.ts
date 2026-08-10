import { scaleLinear } from "d3-scale";
import { curveMonotoneX, line } from "d3-shape";
import type { BeatBand, TensionCurvePoint } from "./tensionCurveTypes";

export const MIN_WIDTH = 720;
export const HEIGHT = 372;
export const CHAPTER_STEP = 56;
export const PADDING = {
  left: 52,
  right: 36,
  top: 22,
  bottom: 92,
};
// 折线绘图区（0-100 值域）与底部的"待定"轨道、章节序号轴分成三条独立的横带，
// 避免三者的文字/线条挤在一起，导致断线原因（未设置数值的章节）看不清。
export const PLOT_BOTTOM = HEIGHT - PADDING.bottom;
export const NULL_TRACK_Y = PLOT_BOTTOM + 30;
export const AXIS_LABEL_Y = NULL_TRACK_Y + 28;
export const TICKS = [0, 25, 50, 75, 100];
export const POINT_NODE_SIZE = 28;
export const POINT_NODE_HALF = POINT_NODE_SIZE / 2;
export const NODE_ORIGIN: [number, number] = [0, 0];
// 容器的 CSS 像素高度：与 TensionCurvePanel 里的 style height 保持同一份常量，
// 避免"缩放比例按高度算"和"容器实际显示高度"两处数字各写各的、悄悄漂移。
export const CONTAINER_HEIGHT = { compact: 236, normal: 430 };
export const MIN_VIEWPORT_ZOOM = 0.6;
export const MAX_VIEWPORT_ZOOM = 1.2;

// 章节一多，画布宽度会远大于容器宽度；此时如果用 fitView 强行把全部宽度塞进一屏，
// 缩放比例会被宽度反向拖累，容器再高也没用——折线区看起来还是那么扁。
// 这里改成"只按高度算缩放"，多出来的宽度交给横向平移/滚轮浏览，而不是压缩进同一屏。
export function computeHeightFitZoom(containerHeight: number): number {
  const raw = (containerHeight * 0.92) / HEIGHT;
  return Math.min(MAX_VIEWPORT_ZOOM, Math.max(MIN_VIEWPORT_ZOOM, raw));
}

export function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function snapScore(value: number, precise = false): number {
  return precise ? clampScore(value) : Math.min(100, Math.max(0, Math.round(value / 5) * 5));
}

export function clampY(value: number): number {
  return Math.min(PLOT_BOTTOM, Math.max(PADDING.top, value));
}

export function chartWidth(pointCount: number): number {
  if (pointCount <= 1) {
    return MIN_WIDTH;
  }
  return Math.max(MIN_WIDTH, PADDING.left + PADDING.right + (pointCount - 1) * CHAPTER_STEP);
}

export function pointX(index: number, count: number): number {
  if (count <= 1) {
    return PADDING.left + (chartWidth(count) - PADDING.left - PADDING.right) / 2;
  }
  return PADDING.left + index * CHAPTER_STEP;
}

export function createYScale() {
  return scaleLinear()
    .domain([0, 100])
    .range([PLOT_BOTTOM, PADDING.top])
    .clamp(true);
}

export const curvePath = line<[number, number]>()
  .x(([x]) => x)
  .y(([, y]) => y)
  .curve(curveMonotoneX);

export function pathFromValues(values: number[], pointCount: number, yScale: ReturnType<typeof createYScale>): string {
  if (values.length < 2) {
    return "";
  }
  return curvePath(values.map((value, index) => [pointX(index, pointCount), yScale(value)])) ?? "";
}

export function selectedScopeMatches(point: TensionCurvePoint, selectedViewportKey: string): boolean {
  return selectedViewportKey === "all" || point.beatKey === selectedViewportKey;
}

export function buildBeatBands(points: TensionCurvePoint[], selectedViewportKey: string): BeatBand[] {
  const ranges = new Map<string, { start: number; end: number }>();
  points.forEach((point, index) => {
    if (!point.beatKey) {
      return;
    }
    const range = ranges.get(point.beatKey) ?? { start: index, end: index };
    range.start = Math.min(range.start, index);
    range.end = Math.max(range.end, index);
    ranges.set(point.beatKey, range);
  });
  return Array.from(ranges, ([key, range]) => {
    const startX = pointX(range.start, points.length);
    const endX = pointX(range.end, points.length);
    return {
      key,
      x: startX - CHAPTER_STEP / 2,
      width: Math.max(CHAPTER_STEP, endX - startX + CHAPTER_STEP),
      label: key,
      active: selectedViewportKey === key,
    };
  });
}
