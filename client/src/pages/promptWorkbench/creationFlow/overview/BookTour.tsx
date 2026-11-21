import { useCallback, useEffect, useReducer, useRef, type RefObject } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { ManuscriptFigure } from "../ManuscriptFigure";
import { stages } from "../flowDefinition";
import { closedTour, lastStop, tourPlayback, tourStops } from "./tourPlayback";

const chapters = stages.map(stage => ({ stage, first: tourStops.findIndex(stop => stop.stage === stage) }));

export function useBookTour(surface: RefObject<HTMLElement | null>) {
  const [{ index, playing }, dispatch] = useReducer(tourPlayback, closedTour);
  const pause = useCallback(() => dispatch("pause"), []);
  const end = useCallback(() => dispatch("end"), []);
  const readAt = useCallback((id: string) => dispatch({ read: id }), []);
  useEffect(() => {
    if (index === null || !playing) return;
    const onVisibility = () => { if (document.hidden) pause(); };
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => !entry.isIntersecting)) pause();
    });
    if (surface.current) observer.observe(surface.current);
    const timer = window.setTimeout(() => {
      if (document.hidden || !surface.current?.getClientRects().length) return pause();
      dispatch({ elapsedAt: index });
    }, 5000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [index, playing, surface, pause]);
  return { index, current: index === null ? null : tourStops[index], playing, pause, end, readAt,
    toggle: () => dispatch("toggle"), seek: (i: number) => dispatch({ seek: i }) };
}

type Tour = ReturnType<typeof useBookTour>;
export function TourDesk({ tour, read }: { tour: Tour; read: (id: string) => void }) {
  const playButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { playButton.current?.focus({ preventScroll: true }); }, []);
  if (!tour.current || tour.index === null) return null;
  const { stage, step } = tour.current;
  const index = tour.index;
  const playLabel = tour.playing ? "暂停导览" : index === lastStop ? "重新播放主线" : "继续导览";
  return <section className="book-tour-desk" data-stage={stage.id} aria-label="主线导览">
    <div className="tour-figure"><ManuscriptFigure id={step.id} /></div>
    <div className="tour-copy" aria-live={tour.playing ? "off" : "polite"}>
      <div className="tour-location">{stage.title}<span>{index + 1} / {tourStops.length}</span></div>
      <strong>{step.title}</strong><p>{step.output}</p>
    </div>
    <div className="tour-controls">
      <button type="button" onClick={() => tour.seek(index - 1)} disabled={index === 0} aria-label="上一步" title="上一步"><ChevronLeft /></button>
      <button type="button" ref={playButton} className="tour-play" onClick={tour.toggle} aria-label={playLabel} title={playLabel}>
        {tour.playing ? <Pause /> : index === lastStop ? <RotateCcw /> : <Play />}</button>
      <button type="button" onClick={() => tour.seek(index + 1)} disabled={index === lastStop} aria-label="下一步" title="下一步"><ChevronRight /></button>
      <button type="button" className="tour-read" onClick={() => read(step.id)}>{step.kind === "ai" ? "读提示词" : "看步骤"}<ArrowUpRight /></button>
    </div>
    <div className="tour-timeline">
      <nav className="tour-stage-index" aria-label="导览阶段">
        {chapters.map(({ stage: chapter, first }, i) => <button key={chapter.id} data-stage={chapter.id}
          type="button" aria-current={chapter === stage ? "step" : undefined} onClick={() => tour.seek(first)}
          style={{ flexGrow: chapter.main.length - (i === chapters.length - 1 ? 1 : 0) }}>{chapter.title}</button>)}
      </nav>
      <input className="tour-seek" aria-label="定位主线步骤" aria-valuetext={`第 ${index + 1} 步，${stage.title}，${step.title}`}
        type="range" min={0} max={lastStop} value={index} onChange={event => tour.seek(Number(event.target.value))} />
    </div>
  </section>;
}
