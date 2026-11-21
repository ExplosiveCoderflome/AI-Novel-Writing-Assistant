import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Check, Copy, FileText, RefreshCw } from "lucide-react";
import { getCreationFlowTemplate } from "@/api/promptWorkbench";
import { Button } from "@/components/ui/button";

export type OpenCatalog = (prompt: { id: string; version: string }) => void;
export function PromptText({ templateKey, onOpenCatalog }: { templateKey: string; onOpenCatalog: OpenCatalog }) {
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
    <p className="reader-note">按示例条件展开的官方模板，〈尖括号〉内是创作时填入的材料。
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
