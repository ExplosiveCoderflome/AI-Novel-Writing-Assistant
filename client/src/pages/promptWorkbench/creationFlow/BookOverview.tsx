import { useCallback, useRef, useState } from "react";
import { ArrowRight, GitBranch } from "lucide-react";
import { locateFlowStep, type FlowStage } from "./flowDefinition";
import { BookMapCanvas } from "./overview/BookMapCanvas";
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
  const entry = locateFlowStep(selected);
  const read = useCallback((id: string) => {
    const target = locateFlowStep(id);
    if (!target) return;
    if (target.optional) setExpanded(true);
    setSelected(id);
  }, []);

  function closeReader() {
    setSelected(null);
    setFocused(false);
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`button[data-step="${selected}"]`)?.focus({ preventScroll: true }));
  }
  function toggleBranches() {
    if (expanded && entry?.optional) {
      setSelected(null);
      setFocused(false);
    }
    setExpanded(!expanded);
  }

  return <section ref={root} className="book-atlas" aria-labelledby="atlas-title">
    <header className="atlas-masthead">
      <div><h2 id="atlas-title">从开书到成稿</h2>
        <p>顺着箭头看一本书怎样写成，点选步骤可查看输入、产出和完整提示词。</p></div>
      <div className="atlas-actions">
        <button type="button" className="atlas-branches" aria-pressed={expanded} onClick={toggleBranches}>
          <GitBranch size={15} />{expanded ? "收起分支" : "展开分支"}</button>
        <button type="button" className="atlas-shortcut" onClick={() => read("draft")}>查看正文写作提示词<ArrowRight size={14} /></button>
      </div>
    </header>
    <div className={`book-atlas-spread ${entry ? "reading" : ""} ${focused ? "focused" : ""}`}>
      <div className="book-map-pane">
        <BookMapCanvas expanded={expanded} selected={selected} enter={enter} read={read} />
        <footer className="book-map-key" aria-label="连线图例">
          <span><i />主流程</span>
          {expanded && <span><i className="key-branch" />可选分支</span>}
          <span><i className="key-return" />逐章、逐卷循环</span>
          <small>拖动画布 · 点阶段标题可单独查看</small>
        </footer>
      </div>
      {entry && <div data-stage={entry.stage.id} className="book-map-reader">
        <PromptReader key={entry.step.id} step={entry.step} stageTitle={entry.stage.title} next={entry.next}
          go={read} onOpenCatalog={onOpenCatalog} focused={focused} toggleFocus={() => setFocused(value => !value)} backToMap={closeReader} />
      </div>}
    </div>
  </section>;
}
