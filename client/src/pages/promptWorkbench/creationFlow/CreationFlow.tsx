import { useCallback, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Feather, Layers3, ListTree, NotebookPen } from "lucide-react";
import { FlowCanvas } from "./FlowCanvas";
import { PromptReader } from "./PromptReader";
import { stages, stageSteps, type Step } from "./flowDefinition";
import "./creationFlow.css";

const stageIcons = [Feather, BookOpen, ListTree, Layers3, NotebookPen];

export default function CreationFlow({ onOpenCatalog }: { onOpenCatalog: (prompt: { id: string; version: string }) => void }) {
  const [selectedId, setSelectedId] = useState("directions");
  const [focused, setFocused] = useState(false);
  const [mobileReader, setMobileReader] = useState(false);
  const stageIndex = stages.findIndex(item => stageSteps(item).some(step => step.id === selectedId));
  const stage = stages[stageIndex];
  const step = stageSteps(stage).find(item => item.id === selectedId)!;
  const mainIndex = stage.main.indexOf(step);
  const branch = stage.branches?.find(item => item.steps.includes(step));
  const afterBranch = branch?.join ? stage.main.find(item => item.id === branch.join) : undefined;
  const next = branch ? branch.steps[branch.steps.indexOf(step) + 1] ?? afterBranch
    : stage.main[mainIndex + 1] ?? stages[stageIndex + 1]?.main[0];
  function openStage(index: number) {
    setSelectedId(stages[index].main[0].id);
    setFocused(false);
    setMobileReader(false);
  }
  const select = useCallback((value: Step) => { setSelectedId(value.id); setMobileReader(true); }, []);
  const go = (id: string) => { setSelectedId(id); setMobileReader(true); };
  return <main className={`creation-flow ${focused ? "reader-focused" : ""} ${mobileReader ? "mobile-reading" : ""}`}>
    <nav className="flow-itinerary" aria-label="创作阶段">
      {stages.map((item, index) => {
        const Icon = stageIcons[index];
        return <button key={item.id} type="button" aria-current={index === stageIndex ? "step" : undefined}
          onClick={() => openStage(index)}><span className="stage-seal"><Icon size={18} strokeWidth={1.65} /></span>
          <span className="stage-number">{String(index + 1).padStart(2, "0")}</span><strong>{item.title}</strong></button>;
      })}
    </nav>
    <div className="flow-spread">
      <section className="flow-map-pane" aria-label="阶段流程图">
        <header className="flow-map-heading"><div className="stage-folio" aria-hidden>{String(stageIndex + 1).padStart(2, "0")}</div>
          <div><h2>{stage.title}</h2><p>{stage.description}</p></div>
        </header>
        <FlowCanvas stage={stage} current={selectedId} select={select} />
        <div className="flow-page-turn">
          <button type="button" disabled={!stageIndex} aria-label="上一阶段" onClick={() => openStage(stageIndex - 1)}><ChevronLeft size={16} />上一阶段</button>
          <button type="button" disabled={stageIndex === stages.length - 1} onClick={() => openStage(stageIndex + 1)}>
            {stages[stageIndex + 1]?.title ?? "最后阶段"}<ChevronRight size={16} /></button>
        </div>
      </section>
      <PromptReader key={step.id} step={step} stageTitle={stage.title} next={next} go={go}
        onOpenCatalog={onOpenCatalog} focused={focused} toggleFocus={() => { setFocused(value => !value); setMobileReader(true); }}
        backToMap={() => { setFocused(false); setMobileReader(false); }} />
    </div>
  </main>;
}
