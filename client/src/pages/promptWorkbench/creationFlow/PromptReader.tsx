import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, BookOpen, Check, Copy, FileText, Maximize2, Minimize2, PanelTop, RefreshCw, X } from "lucide-react";
import { getCreationFlowTemplate } from "@/api/promptWorkbench";
import { Button } from "@/components/ui/button";
import { kindLabels } from "./FlowCanvas";
import type { Step } from "./flowDefinition";

type OpenCatalog = (prompt: { id: string; version: string }) => void;
function PromptText({ templateKey, onOpenCatalog }: { templateKey: string; onOpenCatalog: OpenCatalog }) {
  const query = useQuery({
    queryKey: ["prompt-workbench", "creation-flow-template", templateKey],
    queryFn: () => getCreationFlowTemplate(templateKey), staleTime: 5 * 60 * 1000,
  });
  const [copyStatus, setCopyStatus] = useState<"idle" | "done" | "failed">("idle");
  if (query.isPending) return <p className="reader-status" role="status">正在读取完整提示词…</p>;
  if (query.isError) return <div className="reader-status" role="alert">
    <p>提示词读取失败。</p><Button size="sm" variant="ghost" onClick={() => void query.refetch()}><RefreshCw size={14} />重新读取</Button>
  </div>;
  const { messages, version } = query.data;
  const roleName = (role: string) => ({ system: "系统指令", human: "任务输入", user: "任务输入", ai: "模型消息", assistant: "模型消息" })[role] ?? role;
  async function copy() {
    try {
      await navigator.clipboard.writeText(messages.map(m => `【${roleName(m.role)}】\n${m.content}`).join("\n\n"));
      setCopyStatus("done");
    } catch { setCopyStatus("failed"); }
  }
  return <>
    <div className="reader-section-title"><h3>完整提示词</h3><span className="reader-version">{version}</span>
      <button type="button" className="reader-copy" onClick={() => void copy()} aria-live="polite">
        {copyStatus === "done" ? <Check size={14} /> : <Copy size={14} />}{copyStatus === "done" ? "已复制" : "复制全文"}
      </button>
    </div>
    {copyStatus === "failed" && <p className="reader-status" role="status">复制失败，可选中下方原文手动复制。</p>}
    <p className="reader-note">官方默认写法 · 尖括号标出创作时填入的材料，数量为示例。
      <button type="button" onClick={() => onOpenCatalog({ id: query.data.id, version })}>在目录中打开<ArrowUpRight size={12} /></button>
    </p>
    {messages.map((message, index) => <section className="reader-message" key={index}>
      <h4><FileText size={14} aria-hidden />{roleName(message.role)}<span>{String(index + 1).padStart(2, "0")}</span></h4>
      <div className="reader-prose">{message.content.split(/(〈[^〈〉\r\n]+〉|【[^【】\r\n]+】)/gu).map((part, i) =>
        part.startsWith("〈") && part.endsWith("〉") ? <mark key={i}>{part}</mark>
          : part.startsWith("【") && part.endsWith("】") ? <strong key={i}>{part}</strong> : part)}</div>
    </section>)}
  </>;
}

export function PromptReader({ step, stageTitle, next, go, focused, toggleFocus, backToMap, onOpenCatalog }: {
  step: Step; stageTitle: string; next?: Step; go: (id: string) => void;
  focused: boolean; toggleFocus: () => void; backToMap: () => void;
  onOpenCatalog: OpenCatalog;
}) {
  const [templateIndex, setTemplateIndex] = useState(0);
  const templates = step.templates ?? [];
  const template = templates[templateIndex];
  const destination = step.destination;
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, [step.id]);
  return <section className="flow-reader" aria-label={step.title + "步骤详情"}>
    <div className="flow-reader-bar">
      <span className="flow-reader-breadcrumb"><BookOpen size={15} />{stageTitle}<span>/</span>{kindLabels[step.kind]}</span>
      <button type="button" className="flow-expand" onClick={toggleFocus} aria-pressed={focused}>
        {focused ? <Minimize2 size={15} /> : <Maximize2 size={15} />}{focused ? "返回分栏" : "专注阅读"}
      </button>
      <button className="reader-close" type="button" aria-label="收起详情，返回流程图" title="收起详情，返回流程图" onClick={backToMap}><X size={17} /></button>
    </div>
    <div className="reader-scroll" key={step.id} tabIndex={0} aria-label="阅读步骤和完整提示词">
      <div className="reader-paper">
        <h2 tabIndex={-1} ref={titleRef}>{step.title}</h2>
        <dl className="reader-io"><dt>输入</dt><dd>{step.input}</dd><dt>产出</dt><dd>{step.output}</dd></dl>
        {templates.length > 1 && <div className="reader-variants" aria-label="此步骤的提示词">{templates.map(([key, title], index) =>
          <button key={key} type="button" aria-pressed={index === templateIndex} onClick={() => setTemplateIndex(index)}>{title}</button>)}</div>}
        {template ? <PromptText key={template[0]} templateKey={template[0]} onOpenCatalog={onOpenCatalog} /> :
          <div className="reader-no-prompt"><PanelTop size={18} /><span>{step.kind === "author" ? "由作者完成" : "由系统完成"}，此步无需提示词。</span></div>}
        {destination ? <button className="flow-next" type="button" onClick={() => go(destination)}>{step.title}<ArrowUpRight size={16} /></button>
          : next && <button className="flow-next" type="button" onClick={() => go(next.id)}>下一步 · {next.title}<ArrowRight size={16} /></button>}
      </div>
    </div>
  </section>;
}
