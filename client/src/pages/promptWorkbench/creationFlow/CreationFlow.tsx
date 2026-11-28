import { useCallback, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronLeft, LibraryBig } from "lucide-react";
import { BookOverview } from "./BookOverview";
import { FlowCanvas } from "./FlowCanvas";
import { PromptReader } from "./PromptReader";
import { stages, locateFlowStep, type FlowStage, type Step } from "./flowDefinition";
import { PromptAtlas } from "./atlas/PromptAtlas";
import { relatedAtlasLocation, type AtlasLocation } from "./atlas/atlasTopics";
import type { OpenCatalog } from "./PromptText";
import "./creationFlow.css";

export default function CreationFlow({ onOpenCatalog }: { onOpenCatalog: OpenCatalog }) {
  const [atlas, setAtlas] = useState<AtlasLocation | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  function openAtlas(location: AtlasLocation) {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAtlas(location);
  }
  function back() {
    setAtlas(null);
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  }
  return <>
    <div className="atlas-view-slot" hidden={!!atlas}><LongBookFlow onOpenCatalog={onOpenCatalog} openAtlas={openAtlas} /></div>
    {atlas && <PromptAtlas initial={atlas} back={back} onOpenCatalog={onOpenCatalog} />}
  </>;
}

function LongBookFlow({ onOpenCatalog, openAtlas }: { onOpenCatalog: OpenCatalog; openAtlas: (location: AtlasLocation) => void }) {
  const [stage, setStage] = useState<FlowStage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const go = useCallback((id: string) => {
    const entry = locateFlowStep(id);
    if (entry) { setStage(entry.stage); setSelectedId(id); }
  }, []);
  const select = useCallback((step: Step) => go(step.id), [go]);
  function openStage(item: FlowStage | null) {
    setStage(item);
    setSelectedId(null);
    setFocused(false);
  }
  function closeReader() {
    setFocused(false);
    setSelectedId(null);
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }
  if (!stage) return <BookOverview enter={openStage} onOpenCatalog={onOpenCatalog} openAtlas={openAtlas} />;
  const index = stages.indexOf(stage);
  const { step, next } = locateFlowStep(selectedId) ?? {};

  return <section className={`creation-flow ${step ? "has-reader" : ""} ${focused ? "reader-focused" : ""}`} data-stage={stage.id}>
    <nav className="flow-itinerary" aria-label="创作阶段">
      <button type="button" className="itinerary-home" onClick={() => openStage(null)}><LibraryBig size={16} />全书总览</button>
      <div>{stages.map((item, i) => <button key={item.id} type="button" data-stage={item.id}
        aria-current={item === stage ? "step" : undefined} onClick={() => openStage(item)}>
        <span>{String(i + 1).padStart(2, "0")}</span>{item.title}</button>)}</div>
    </nav>
    <div className="flow-spread">
      <section className="flow-map-pane" aria-label="阶段流程图">
        <header className="flow-map-heading"><span className="stage-folio" aria-hidden>{String(index + 1).padStart(2, "0")}</span>
          <div><h2 ref={heading} tabIndex={-1}>{stage.title}</h2><p>{stage.description}</p></div>
          <button type="button" className="stage-map-related" onClick={() => openAtlas({ scope: stage.id })}>阶段提示词<ArrowUpRight size={14} /></button>
        </header>
        <FlowCanvas stage={stage} current={selectedId ?? undefined} select={select} jump={go} />
        <footer className="flow-page-turn">
          <button type="button" onClick={() => openStage(stages[index - 1] ?? null)}><ChevronLeft size={14} />{stages[index - 1]?.title ?? "全书总览"}</button>
          <span className="stage-counter">{String(index + 1).padStart(2, "0")} / 05</span>
          <button type="button" onClick={() => openStage(stages[index + 1] ?? null)}>
            {stages[index + 1]?.title ?? "全书总览"}{index === 4 ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}</button>
        </footer>
      </section>
      {step && <PromptReader key={step.id} step={step} stageTitle={stage.title} next={next} go={go}
        openRelated={() => openAtlas(relatedAtlasLocation(stage.id, step.id))}
        onOpenCatalog={onOpenCatalog} focused={focused} toggleFocus={() => setFocused(value => !value)} backToMap={closeReader} />}
    </div>
  </section>;
}
