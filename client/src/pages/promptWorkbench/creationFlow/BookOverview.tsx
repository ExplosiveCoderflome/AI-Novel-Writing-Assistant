import { useCallback, useRef, useState } from "react";
import { ArrowRight, GitBranch, Play, Square } from "lucide-react";
import { locateFlowStep, type FlowStage } from "./flowDefinition";
import { BookMapCanvas } from "./overview/BookMapCanvas";
import { TourDesk, useBookTour } from "./overview/BookTour";
import { PromptReader } from "./PromptReader";
import "./overview/bookMap.css";

export function BookOverview({ enter, onOpenCatalog }: {
  enter: (stage: FlowStage) => void;
  onOpenCatalog: (prompt: { id: string; version: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const root = useRef<HTMLElement>(null);
  const tourTrigger = useRef<HTMLButtonElement>(null);
  const tour = useBookTour(root);
  const readAt = tour.readAt;
  const entry = locateFlowStep(selected);
  const read = useCallback((id: string) => {
    const target = locateFlowStep(id);
    if (!target) return;
    readAt(id);
    if (target.optional) setExpanded(true);
    setSelected(id);
  }, [readAt]);

  function closeReader() {
    setSelected(null);
    setFocused(false);
    if (tour.current) return;
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`button[data-step="${selected}"]`)?.focus({ preventScroll: true }));
  }
  function toggleBranches() {
    tour.pause();
    if (expanded && entry?.optional) {
      setSelected(null);
      setFocused(false);
    }
    setExpanded(!expanded);
  }
  function startTour() {
    setSelected(null);
    setFocused(false);
    tour.toggle();
  }
  function closeTour() {
    tour.end();
    setSelected(null);
    setFocused(false);
    requestAnimationFrame(() => tourTrigger.current?.focus({ preventScroll: true }));
  }

  return <section ref={root} className="book-atlas" aria-labelledby="atlas-title">
    <header className="atlas-masthead">
      <div><h2 id="atlas-title">从开书到<span>成稿</span></h2>
        <p>沿五个阶段走完一本书，点选步骤可读输入、产出与完整提示词。</p></div>
      <div className="atlas-actions">
        <button type="button" ref={tourTrigger} className="atlas-play" onClick={tour.current ? (entry ? closeReader : closeTour) : startTour}>
          {tour.current ? <Square size={12} /> : <Play size={14} fill="currentColor" />}
          {tour.current ? (entry ? "返回导览" : "退出导览") : "播放主线"}</button>
        <button type="button" className="atlas-branches" aria-pressed={expanded} onClick={toggleBranches}>
          <GitBranch size={15} />{expanded ? "收起分支" : "展开分支"}</button>
        <button type="button" className="atlas-shortcut" onClick={() => read("draft")}>查看正文写作提示词<ArrowRight size={14} /></button>
      </div>
    </header>
    <div className={`book-atlas-spread ${entry ? "reading" : ""} ${focused ? "focused" : ""}`}>
      <div className="book-map-pane">
        <BookMapCanvas expanded={expanded} selected={selected} touring={entry ? null : tour.current?.step.id ?? null} enter={enter} read={read} pause={tour.pause} />
        {tour.current && !entry ? <TourDesk tour={tour} read={read} /> : <footer className="book-map-key" aria-label="连线图例">
          <span><i />主流程</span>
          {expanded && <span><i className="key-branch" />可选分支</span>}
          <span><i className="key-return" />逐章、逐卷循环</span>
          <small>拖动平移 · 停在步骤上追踪连线</small>
        </footer>}
      </div>
      {entry && <div data-stage={entry.stage.id} className="book-map-reader">
        <PromptReader key={entry.step.id} step={entry.step} stageTitle={entry.stage.title} next={entry.next}
          go={read} onOpenCatalog={onOpenCatalog} focused={focused} toggleFocus={() => setFocused(value => !value)} backToMap={closeReader} />
      </div>}
    </div>
  </section>;
}
