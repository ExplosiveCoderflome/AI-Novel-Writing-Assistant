import { useCallback, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronLeft, LibraryBig } from "lucide-react";
import { BookOverview } from "./BookOverview";
import { FlowCanvas } from "./FlowCanvas";
import { PromptReader } from "./PromptReader";
import { stages, stageSteps, type FlowStage, type Step } from "./flowDefinition";
import "./creationFlow.css";

export default function CreationFlow({ onOpenCatalog }: { onOpenCatalog: (prompt: { id: string; version: string }) => void }) {
  const [stage, setStage] = useState<FlowStage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const go = useCallback((id: string) => {
    const owner = stages.find(item => stageSteps(item).some(step => step.id === id));
    if (owner) { setStage(owner); setSelectedId(id); }
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
  if (!stage) return <BookOverview enter={openStage} read={go} />;
  const index = stages.indexOf(stage);
  const step = stageSteps(stage).find(item => item.id === selectedId);
  const branch = stage.branches?.find(item => step && item.steps.includes(step));
  const afterBranch = branch?.join ? stage.main.find(item => item.id === branch.join) : undefined;
  const next = step && (branch ? branch.steps[branch.steps.indexOf(step) + 1] ?? afterBranch
    : stage.main[stage.main.indexOf(step) + 1] ?? stages[index + 1]?.main[0]);

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
        onOpenCatalog={onOpenCatalog} focused={focused} toggleFocus={() => setFocused(value => !value)} backToMap={closeReader} />}
    </div>
  </section>;
}
