import { ArrowDownRight, ArrowRight, CornerDownRight, GitBranch, Repeat2 } from "lucide-react";
import { stages, type FlowStage } from "./flowDefinition";
import { ManuscriptFigure } from "./ManuscriptFigure";

export function BookOverview({ enter, read }: { enter: (stage: FlowStage) => void; read: (id: string) => void }) {
  return <section className="book-atlas" aria-labelledby="atlas-title">
    <header className="atlas-masthead">
      <div><h2 id="atlas-title">从开书到成稿</h2><p>点选步骤阅读完整提示词，进入阶段查看分支与承接。</p></div>
      <button className="atlas-shortcut" type="button" onClick={() => read("draft")}>查看正文写作提示词<ArrowRight size={15} /></button>
    </header>
    <div className="atlas-chapters">
      {stages.map((stage, index) => {
        const last = stage.main[stage.main.length - 1];
        const branches = stage.branches?.length ?? 0;
        return <section key={stage.id} className="atlas-chapter" data-stage={stage.id} aria-label={stage.title}>
          <button type="button" className="atlas-cover" onClick={() => enter(stage)} aria-label={`打开${stage.title}流程图`}>
            <span className="atlas-cover-index">{String(index + 1).padStart(2, "0")}</span><ArrowDownRight size={17} className="atlas-cover-arrow" />
            <span className="atlas-cover-figure"><ManuscriptFigure id={stage.coverStep} /></span>
            <strong>{stage.title}</strong><span className="atlas-deliverable">{last.artifact}</span>
          </button>
          <ol className="atlas-step-index">
            {stage.main.map(step => <li key={step.id}><button type="button" onClick={() => read(step.id)}>
              <i aria-hidden="true" /><span>{step.title}</span><ArrowRight size={13} /></button></li>)}
          </ol>
          <button type="button" className="atlas-open" onClick={() => enter(stage)}><GitBranch size={14} />
            {branches ? `查看流程与 ${branches} 条分支` : "查看阶段流程"}<ArrowRight size={14} /></button>
        </section>;
      })}
    </div>
    <aside className="atlas-loop" aria-label="逐章、逐卷推进">
      <Repeat2 size={20} /><strong>逐章推进</strong>
      <button type="button" onClick={() => read("extract")}>本章故事变化</button><CornerDownRight size={15} />
      <button type="button" onClick={() => read("mission")}>带入下一章</button>
      <span className="atlas-loop-divider" />
      <button type="button" onClick={() => read("beats")}>本卷完成后，安排下一卷<ArrowRight size={14} /></button>
    </aside>
  </section>;
}
