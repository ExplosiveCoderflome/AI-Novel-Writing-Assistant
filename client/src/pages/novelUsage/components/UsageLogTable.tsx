import type { NovelUsagePage } from "@ai-novel/shared/types/llmUsage";
import { formatUsageTokens, usageStageLabel, usageStatusLabel, usageTime } from "../presentation";

export function UsageLogTable({ items }: { items: NovelUsagePage["items"] }) {
  if (!items.length) return <p className="py-8 text-sm text-muted-foreground">没有符合筛选条件的调用记录。</p>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs">
    <thead className="border-b border-border/60 text-muted-foreground"><tr>{["开始时间", "章节与步骤", "厂商与模型", "输入 Tokens", "输出 Tokens", "累计 Tokens", "调用状态"].map(label => <th key={label} className="px-3 py-3 font-normal first:pl-0">{label}</th>)}</tr></thead>
    <tbody className="divide-y divide-border/50">{items.map(item => <tr key={item.invocationId} className="align-top">
      <td className="whitespace-nowrap py-4 pr-3">{usageTime(item.startedAt)}<p className="mt-1 text-muted-foreground">{Math.max(0, (Date.parse(item.finishedAt) - Date.parse(item.startedAt)) / 1000).toFixed(1)} 秒</p></td>
      <td className="max-w-64 px-3 py-4"><p className="font-medium">{item.chapter ? `第 ${item.chapter.order} 章 · ${item.chapter.title}` : item.chapterId ? "章节信息未记录" : "书级 / 未归属章节"}</p><p className="mt-1 text-muted-foreground">{usageStageLabel(item.stage)}</p>
        <details className="mt-2 text-muted-foreground"><summary className="cursor-pointer">调用详情</summary><dl className="mt-2 space-y-1 break-all"><dt>调用编号</dt><dd>{item.invocationId}</dd>{item.runId ? <><dt>创作批次</dt><dd>{item.runId}</dd></> : null}{item.promptId ? <><dt>提示词版本</dt><dd>{item.promptId} · {item.promptVersion ?? "未记录"}</dd></> : null}</dl></details>
      </td>
      <td className="max-w-52 break-words px-3 py-4"><p>{item.provider ?? "厂商未记录"}</p><p className="mt-1 text-muted-foreground">{item.model ?? "模型未记录"}</p></td>
      <td className="whitespace-nowrap px-3 py-4 tabular-nums"><p className="font-medium">{formatUsageTokens(item.promptTokens)}</p><div className="mt-1 space-y-1 text-[11px] text-muted-foreground"><p>命中 {cacheCount(item, "cacheHitTokens")}</p><p>未命中 {cacheCount(item, "cacheMissTokens")}</p></div></td>
      <td className="px-3 py-4 tabular-nums">{formatUsageTokens(item.completionTokens)}</td>
      <td className="px-3 py-4 font-medium tabular-nums">{formatUsageTokens(item.totalTokens)}</td>
      <td className="whitespace-nowrap px-3 py-4"><span className={item.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{usageStatusLabel(item.status)}</span></td>
    </tr>)}</tbody>
  </table></div>;
}

function cacheCount(item: NovelUsagePage["items"][number], key: "cacheHitTokens" | "cacheMissTokens"): string {
  return item.inputCache.cacheUsageStatus === "invalid" ? "统计不可用" : item.inputCache.cacheUsageStatus === "reported" ? formatUsageTokens(item.inputCache[key]) : "未提供";
}
