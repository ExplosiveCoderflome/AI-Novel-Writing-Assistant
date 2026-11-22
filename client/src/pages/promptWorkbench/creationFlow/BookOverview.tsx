import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, GitBranch, LibraryBig, Play, Square } from "lucide-react";
import { relatedAtlasLocation, type AtlasLocation } from "./atlas/atlasTopics";
import { locateFlowStep, stages, type FlowStage } from "./flowDefinition";
import { RegisteredAssetReader } from "./atlas/AssetReader";
import { layoutBookMap } from "./overview/bookMapLayout";
import { relationsFor } from "./atlas/stepPromptRelations";
import { PromptConnections } from "./overview/PromptConnections";
import { BookMapCanvas } from "./overview/BookMapCanvas";
import { TourDesk, useBookTour } from "./overview/BookTour";
import { PromptReader } from "./PromptReader";
import "./overview/bookMap.css";

export function BookOverview({ enter, onOpenCatalog, openAtlas }: {
  enter: (stage: FlowStage) => void;
  onOpenCatalog: (prompt: { id: string; version: string }) => void;
  openAtlas: (location: AtlasLocation) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const layout = useMemo(() => layoutBookMap(stages, expanded), [expanded]);
  const [jump, setJump] = useState<{ scope: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const root = useRef<HTMLElement>(null);
  const tourTrigger = useRef<HTMLButtonElement>(null);
  const tour = useBookTour(root);
  const readAt = tour.readAt;
  const entry = locateFlowStep(selected);
  const reference = selected ? layout.prompts.get(selected) : undefined;
  const reading = Boolean(entry || reference);
  const inspecting = expanded && reading && relationsFor(selected).length > 0;
  const read = useCallback((id: string) => {
    const target = locateFlowStep(id);
    if (!target) return;
    readAt(id);
    if (target.optional) setExpanded(true);
    setSelected(id);
  }, [readAt]);

  const readReference = useCallback((id: string) => {
    tour.pause();
    setExpanded(true);
    setSelected(id);
  }, [tour.pause]);

  const locateScope = useCallback((scope: string) => {
    tour.pause();
    setFocused(false);
    setSelected(null);
    setExpanded(true);
    setJump({ scope });
  }, [tour.pause]);
  useEffect(() => {
    if (jump) root.current?.querySelector<HTMLButtonElement>(`[data-ref-scope="${jump.scope}"]`)?.focus({ preventScroll: true });
  }, [jump]);

  function closeReader() {
    setSelected(null);
    setFocused(false);
    if (tour.current) return;
    const attribute = reference ? "data-map-prompt" : "data-step";
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`button[${attribute}="${selected}"]`)?.focus({ preventScroll: true }));
  }
  function toggleBranches() {
    tour.pause();
    if (expanded && (entry?.optional || reference)) {
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
  function openPrompts(location: AtlasLocation) {
    tour.pause();
    openAtlas(location);
  }
  const openScope = useCallback((scope: string) => {
    tour.pause();
    openAtlas({ scope });
  }, [openAtlas, tour.pause]);

  return <section ref={root} className="book-atlas" aria-labelledby="atlas-title">
    <header className="atlas-masthead">
      <div><h2 id="atlas-title">从开书到<span>成稿</span></h2>
        <p>{expanded ? "沿五个阶段读主线。左侧是独立创作工具，各阶段下方可点读相关提示词。" : "沿五个阶段读主线，展开分支可查看辅助步骤与相关提示词。"}</p></div>
      <div className="atlas-actions">
        <button type="button" ref={tourTrigger} className="atlas-play" onClick={tour.current ? (reading ? closeReader : closeTour) : startTour}>
          {tour.current ? <Square size={12} /> : <Play size={14} fill="currentColor" />}
          {tour.current ? (reading ? "返回导览" : "退出导览") : "播放主线"}</button>
        <button type="button" className="atlas-branches" aria-pressed={expanded} onClick={toggleBranches}>
          <GitBranch size={15} />{expanded ? "收起分支" : "展开分支"}</button>
        <button type="button" className="atlas-shortcut" onClick={() => read("draft")}>查看正文写作提示词<ArrowRight size={14} /></button>
        <button type="button" className="atlas-shortcut" onClick={() => locateScope("tools")}><LibraryBig size={15} />独立创作工具</button>
      </div>
    </header>
    <div className={`book-atlas-spread ${reading ? "reading" : ""} ${focused ? "focused" : ""} ${inspecting ? "inspecting" : ""}`}>
      <div className="book-map-pane">
        <BookMapCanvas layout={layout} selected={selected} touring={reading ? null : tour.current?.step.id ?? null} enter={enter} jump={jump}
          locateScope={locateScope} openScope={openScope} readReference={readReference} read={read} pause={tour.pause} />
        {tour.current && !reading ? <TourDesk tour={tour} read={read} /> : <footer className="book-map-key" aria-label="连线图例">
          <span><i />主流程</span>
          {expanded && <span><i className="key-branch" />可选分支</span>}
          {expanded && <span><i className="key-reference" />步骤与提示词</span>}
          <span><i className="key-return" />逐章、逐卷循环</span>
          <small>拖动平移 · 点选步骤或提示词追踪连线</small>
        </footer>}
      </div>
      {entry && <div data-stage={entry.stage.id} className="book-map-reader">
        <PromptReader key={entry.step.id} step={entry.step} stageTitle={entry.stage.title} next={entry.next}
          openRelated={() => openPrompts(relatedAtlasLocation(entry.stage.id, entry.step.id))}
          go={read} onOpenCatalog={onOpenCatalog} focused={focused} toggleFocus={() => setFocused(value => !value)} backToMap={closeReader}>
          <PromptConnections id={entry.step.id} open={readReference} />
        </PromptReader>
      </div>}
      {reference && <div data-stage={reference.scope} className="book-map-reader">
        <RegisteredAssetReader key={reference.id} id={reference.id} title={reference.title} topicTitle={reference.topic.title}
          focused={focused} toggleFocus={() => setFocused(value => !value)} backToMap={closeReader} onOpenCatalog={onOpenCatalog}>
          <PromptConnections id={reference.id} open={read} />
        </RegisteredAssetReader>
      </div>}
    </div>
  </section>;
}
