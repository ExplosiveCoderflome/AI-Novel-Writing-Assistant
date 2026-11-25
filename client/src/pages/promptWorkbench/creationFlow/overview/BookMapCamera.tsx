import { useEffect, useRef } from "react";
import { Panel, getViewportForBounds, useNodesInitialized, useReactFlow, useStore, useStoreApi, type Viewport } from "@xyflow/react";
import { Maximize, Minus, Plus } from "lucide-react";
import { layoutBookMap, promptConnectionBounds, sideWidth, stepHeight, stepWidth } from "./bookMapLayout";

type Layout = ReturnType<typeof layoutBookMap>;
function travel(duration: number) {
  return { duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : duration,
    interpolate: "linear" as const, ease: (t: number) => 1 - (1 - t) ** 3 };
}

export function BookMapCamera({ layout, selected, touring, jump, pause }: {
  layout: Layout; selected: string | null; touring: string | null; jump: { scope: string } | null; pause: () => void;
}) {
  const width = useStore(s => s.width);
  const height = useStore(s => s.height);
  const percent = useStore(s => Math.round(s.transform[2] * 100));
  const ready = useNodesInitialized();
  const { getViewport, setViewport, setCenter, zoomIn, zoomOut, fitBounds, viewportInitialized } = useReactFlow();
  const previous = useRef<{ layout: Layout; focus: string | null; touring: string | null; width: number; height: number } | null>(null);
  const bookmark = useRef<Viewport | null>(null);
  const lastJump = useRef(jump);
  const store = useStoreApi();
  useEffect(() => {
    const canvas = store.getState().domNode;
    if (!canvas) return;
    function revealKeyboardRow(event: FocusEvent) {
      if (!(event.target instanceof HTMLButtonElement) || !event.target.matches(":focus-visible")) return;
      const row = layout.prompts.get(event.target.dataset.mapPrompt ?? "");
      if (!row) return;
      const { width, height, transform: [x, y, zoom] } = store.getState();
      const left = row.x * zoom + x, top = row.y * zoom + y;
      if (left < 0 || left + row.width * zoom > width || top < 0 || top + row.height * zoom > height) {
        pause();
        void setCenter(row.x + row.width / 2, row.y + row.height / 2, { zoom });
      }
    }
    canvas.addEventListener("focusin", revealKeyboardRow);
    return () => canvas.removeEventListener("focusin", revealKeyboardRow);
  }, [store, viewportInitialized, layout, setCenter, pause]);

  useEffect(() => {
    if (!ready || !viewportInitialized || width <= 1 || height <= 1) return;
    const prior = previous.current;
    const focus = selected ?? touring;
    previous.current = { layout, focus, touring, width, height };
    let view = getViewport();
    const freshLayout = !prior || prior.layout !== layout;
    if (freshLayout) {
      const opening = width >= 1024 ? { ...layout.bounds, height: layout.routeBounds.height } : layout.routeBounds;
      const fit = getViewportForBounds(opening, width, height, 0.16, 1.18, 0.08);
      const zoom = Math.max(0.72, fit.zoom);
      view = {
        x: Math.max(16, (width - opening.width * zoom) / 2) - opening.x * zoom,
        y: layout.sections.length ? 18 - opening.y * zoom : Math.max(16, (height - opening.height * zoom) / 2) - opening.y * zoom, zoom,
      };
      bookmark.current = null;
      if (!focus) void setViewport(view);
    }
    if (jump && jump !== lastJump.current) {
      const section = layout.sections.find(s => s.scope.id === jump.scope);
      if (section) {
        lastJump.current = jump;
        bookmark.current = null;
        const zoom = Math.min(1.15, (width - 28) / section.width);
        void setViewport({ x: (width - section.width * zoom) / 2 - section.x * zoom, y: 16 - section.y * zoom, zoom }, travel(320));
        return;
      }
    }
    if (!focus) {
      if (bookmark.current) void setViewport(bookmark.current, travel(320));
      bookmark.current = null;
      return;
    }
    if (!bookmark.current) bookmark.current = view;
    const endpoints = selected && promptConnectionBounds(layout, selected);
    if (endpoints) {
      if (freshLayout || prior?.focus !== selected || prior.width !== width || prior.height !== height) {
        const frame = getViewportForBounds(endpoints, width, height, 0.08, 1.25, 0.1);
        void setViewport(frame, travel(300));
      }
      return;
    }
    const reference = layout.prompts.get(focus);
    if (reference) {
      const zoom = Math.max(view.zoom, 0.87);
      const x = reference.x * zoom + view.x, y = reference.y * zoom + view.y;
      if (zoom !== view.zoom || x < 8 || x + reference.width * zoom > width - 8 || y < 8 || y + reference.height * zoom > height - 40) {
        void setCenter(reference.x + reference.width / 2, reference.y + reference.height / 2, { zoom, ...travel(260) });
      }
      return;
    }
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
  }, [layout, selected, touring, jump, width, height, ready, viewportInitialized, getViewport, setViewport, setCenter]);

  return <Panel position="bottom-right" className="book-zoom">
    <button type="button" aria-label="缩小全书流程图" title="缩小" onClick={() => { pause(); void zoomOut(travel(150)); }}><Minus size={15} /></button>
    <span className="book-zoom-value">{percent}%</span>
    <button type="button" aria-label="放大全书流程图" title="放大" onClick={() => { pause(); void zoomIn(travel(150)); }}><Plus size={15} /></button>
    <button type="button" onClick={() => { pause(); void fitBounds(layout.bounds, { padding: 0.08, ...travel(360) }); }}><Maximize size={14} />全图</button>
  </Panel>;
}
