import { useEffect, useRef } from "react";
import { Panel, getViewportForBounds, useNodesInitialized, useReactFlow, useStore, type Viewport } from "@xyflow/react";
import { Maximize, Minus, Plus } from "lucide-react";
import { layoutBookMap, sideWidth, stepHeight, stepWidth } from "./bookMapLayout";

type Layout = ReturnType<typeof layoutBookMap>;
function travel(duration: number) {
  return { duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : duration,
    interpolate: "linear" as const, ease: (t: number) => 1 - (1 - t) ** 3 };
}

export function BookMapCamera({ layout, selected, touring, pause }: {
  layout: Layout; selected: string | null; touring: string | null; pause: () => void;
}) {
  const width = useStore(s => s.width);
  const height = useStore(s => s.height);
  const percent = useStore(s => Math.round(s.transform[2] * 100));
  const ready = useNodesInitialized();
  const { getViewport, setViewport, setCenter, zoomIn, zoomOut, fitBounds, viewportInitialized } = useReactFlow();
  const previous = useRef<{ layout: Layout; focus: string | null; touring: string | null; width: number; height: number } | null>(null);
  const bookmark = useRef<Viewport | null>(null);
  useEffect(() => {
    if (!ready || !viewportInitialized || width <= 1 || height <= 1) return;
    const prior = previous.current;
    const focus = selected ?? touring;
    previous.current = { layout, focus, touring, width, height };
    let view = getViewport();
    const freshLayout = !prior || prior.layout !== layout;
    if (freshLayout) {
      const fit = getViewportForBounds(layout.bounds, width, height, 0.16, 1.18, 0.08);
      const zoom = Math.max(0.72, fit.zoom);
      view = zoom === fit.zoom ? fit : {
        x: Math.max(16, (width - layout.bounds.width * zoom) / 2 - layout.bounds.x * zoom),
        y: Math.max(16, (height - layout.bounds.height * zoom) / 2 - layout.bounds.y * zoom), zoom,
      };
      bookmark.current = null;
      if (!focus) void setViewport(view);
    }
    if (!focus) {
      if (bookmark.current) void setViewport(bookmark.current, travel(320));
      bookmark.current = null;
      return;
    }
    if (!bookmark.current) bookmark.current = view;
    const station = layout.stations.find(s => s.step.id === focus);
    if (!station) return;
    const w = station.side ? sideWidth : stepWidth;
    if (touring) {
      const previousStage = layout.stations.find(s => s.step.id === prior?.touring)?.stage;
      const reframed = freshLayout || previousStage !== station.stage || prior?.width !== width || prior?.height !== height;
      if (reframed) {
        const last = layout.stations.find(s => s.step === station.stage.main.at(-1))!;
        const frame = getViewportForBounds({ x: station.x - 20, y: -9, width: w + 40, height: last.y + stepHeight + 26 },
          width, height, 0.88, 1.4, 0.09);
        frame.y = Math.min(Math.max(frame.y, 16 - station.y * frame.zoom), height - 24 - (station.y + stepHeight) * frame.zoom);
        void setViewport(frame, travel(540));
        return;
      }
    }
    const x = station.x * view.zoom + view.x, y = station.y * view.zoom + view.y;
    if (freshLayout || x < 8 || x + w * view.zoom > width - 8 || y < 8 || y + stepHeight * view.zoom > height - 40) {
      void setCenter(station.x + w / 2, station.y + stepHeight / 2, { zoom: view.zoom, ...travel(310) });
    }
  }, [layout, selected, touring, width, height, ready, viewportInitialized, getViewport, setViewport, setCenter]);

  return <Panel position="bottom-right" className="book-zoom">
    <button type="button" aria-label="缩小全书流程图" title="缩小" onClick={() => { pause(); void zoomOut(travel(150)); }}><Minus size={15} /></button>
    <span className="book-zoom-value">{percent}%</span>
    <button type="button" aria-label="放大全书流程图" title="放大" onClick={() => { pause(); void zoomIn(travel(150)); }}><Plus size={15} /></button>
    <button type="button" onClick={() => { pause(); void fitBounds(layout.bounds, { padding: 0.08, ...travel(360) }); }}><Maximize size={14} />全图</button>
  </Panel>;
}
