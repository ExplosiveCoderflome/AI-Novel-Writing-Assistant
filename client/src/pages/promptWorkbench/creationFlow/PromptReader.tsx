import { useState, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight, LibraryBig, PanelTop } from "lucide-react";
import { ReaderFrame } from "./ReaderFrame";
import { kindLabels } from "./FlowCanvas";
import type { Step } from "./flowDefinition";
import { PromptText, type OpenCatalog } from "./PromptText";

export function PromptReader({ step, stageTitle, next, go, focused, toggleFocus, backToMap, onOpenCatalog, openRelated, children }: {
  step: Step; stageTitle: string; next?: Step; go: (id: string) => void;
  focused: boolean; toggleFocus: () => void; backToMap: () => void;
  onOpenCatalog: OpenCatalog;
  openRelated: () => void;
  children?: ReactNode;
}) {
  const [templateIndex, setTemplateIndex] = useState(0);
  const templates = step.templates ?? [];
  const template = templates[templateIndex];
  const destination = step.destination;
  return <ReaderFrame title={step.title} breadcrumb={stageTitle} kind={kindLabels[step.kind]}
    focused={focused} toggleFocus={toggleFocus} backToMap={backToMap}>
    {children}
    <button type="button" className="atlas-reader-link" onClick={openRelated}><LibraryBig size={14} />{children ? "浏览主题分图" : "查看相关提示词"}<ArrowUpRight size={13} /></button>
    <dl className="reader-io"><dt>输入</dt><dd>{step.input}</dd><dt>产出</dt><dd>{step.output}</dd></dl>
    {templates.length > 1 && <div className="reader-variants" aria-label="此步骤的提示词">{templates.map(([key, title], index) =>
      <button key={key} type="button" aria-pressed={index === templateIndex} onClick={() => setTemplateIndex(index)}>{title}</button>)}</div>}
    {template ? <PromptText key={template[0]} templateKey={template[0]} onOpenCatalog={onOpenCatalog} /> :
      <div className="reader-no-prompt"><PanelTop size={18} /><span>{step.kind === "author" ? "由作者完成" : "由系统完成"}，此步无需提示词。</span></div>}
    {destination ? <button className="flow-next" type="button" onClick={() => go(destination)}>{step.title}<ArrowUpRight size={16} /></button>
      : next && <button className="flow-next" type="button" onClick={() => go(next.id)}>下一步 · {next.title}<ArrowRight size={16} /></button>}
  </ReaderFrame>;
}
