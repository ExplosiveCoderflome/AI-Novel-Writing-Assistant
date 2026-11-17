import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getNovelInvocation } from "@/api/novel/usage";
import { Button } from "@/components/ui/button";
import { formatUsageDuration, usageStatusLabel } from "../presentation";
import type { LlmOutputBudgetTrace } from "@ai-novel/shared/types/llmUsage";

const budgetSources: Record<LlmOutputBudgetTrace["source"], string> = {
  automatic: "自动预算", task: "本次任务", route: "模型路由", endpoint: "模型输出上限",
  frozen: "已保存的任务预算", structured: "结构化输出限制", provider: "由端点决定",
};

function OutputBudget({ trace }: { trace: LlmOutputBudgetTrace }) {
  const fields = [
    ["任务请求", trace.requestedMaxTokens], ["模型路由", trace.routeMaxTokens],
    ["自动预算", trace.automaticMaxTokens], ["模型输出上限", trace.endpointMaxTokens],
    ["已保存的任务预算", trace.frozenMaxTokens], ["结构化输出限制", trace.structuredMaxTokens],
    ["思考预留", trace.reasoningReserveTokens],
  ] as const;
  return <details className="space-y-2">
    <summary className="cursor-pointer">
      输出预算 {trace.finalMaxTokens == null ? "由端点决定" : `${trace.finalMaxTokens.toLocaleString("zh-CN")} Tokens · ${budgetSources[trace.source]}`}
    </summary>
    <dl className="grid grid-cols-2 gap-1 text-muted-foreground">
      {fields.map(([label, amount]) => amount == null ? null : <div key={label} className="contents">
        <dt>{label}</dt><dd>{amount.toLocaleString("zh-CN")} Tokens</dd>
      </div>)}
    </dl>
  </details>;
}

export function InvocationDetail({ novelId, invocationId, onJump }: { novelId: string; invocationId: string; onJump: (id: string) => void }) {
  const query = useQuery({ queryKey: ["novel-invocation", novelId, invocationId], queryFn: () => getNovelInvocation(novelId, invocationId) });
  const data = query.data?.data;
  if (query.isPending) return <p className="py-3">正在读取消息与回答…</p>;
  if (query.isError) return <div role="alert"><p>调用详情读取失败。</p><Button variant="ghost" onClick={() => void query.refetch()}>重新读取</Button></div>;
  if (!data) return null;
  return <div className="space-y-4 py-3 text-xs">
    <p className="break-all text-muted-foreground">调用编号：{invocationId}</p>
    <p>耗时 {formatUsageDuration(data.item.durationMs)} · 首次返回 {formatUsageDuration(data.item.firstTokenMs)} · 第 {data.item.attemptNumber} 次尝试 · {data.item.structuredMode ?? "文本输出"}</p>
    {data.item.budgetTrace ? <OutputBudget trace={data.item.budgetTrace} /> : null}
    {data.item.finishReason ? <p>模型结束原因 · {data.item.finishReason}</p> : null}
    {data.item.structureStatus ? <p>结构校验 · {data.item.structureStatus === "valid" ? "通过" : "未通过"}</p> : null}
    <div className="space-y-1"><p className="font-medium">尝试链（{data.chain.length} 次）</p>{data.chain.map(attempt => <button key={attempt.invocationId} type="button" className="block text-left text-primary underline-offset-4 hover:underline" onClick={() => onJump(attempt.invocationId)}>第 {attempt.attemptNumber} 次 · {attempt.model ?? "未记录模型"} · {attempt.structuredMode ?? "文本输出"} · {usageStatusLabel(attempt.status)} · {formatUsageDuration(attempt.durationMs)}</button>)}</div>
    {data.payload ? <>
      <div className="space-y-2"><p className="font-medium">提示词消息</p>{data.payload.messages.map((message, index) => <PayloadText key={index} label={`${index + 1}. ${message.role}`} text={typeof message.content === "string" ? message.content : JSON.stringify(message.content, null, 2)} />)}</div>
      <PayloadText label="模型原始回答" text={data.payload.response} />
      {data.payload.parsed !== null ? <PayloadText label="结构化解析结果" text={JSON.stringify(data.payload.parsed, null, 2)} /> : null}
      {data.payload.error ? <PayloadText label="调用或解析错误" text={data.payload.error} /> : null}
    </> : <p className="text-muted-foreground">此调用未保存消息与回答，或内容已按保留设置清理。可在“设置 → 模型与厂商”开启历史记录。</p>}
  </div>;
}

function PayloadText({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false), [error, setError] = useState(false);
  return <details className="space-y-2" open={text.length < 500 ? true : undefined}>
    <summary className="cursor-pointer font-medium">{label} · {text.length.toLocaleString()} 字符</summary>
    <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(text).then(() => { setCopied(true); setError(false); }, () => setError(true))}>{copied ? "已复制" : "复制"}</Button>
    {error ? <span role="alert">复制失败，请选择文本复制。</span> : null}
    <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-3 font-mono">{text || "（空）"}</pre>
  </details>;
}
