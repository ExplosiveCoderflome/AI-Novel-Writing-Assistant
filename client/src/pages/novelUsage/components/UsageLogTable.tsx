import { Fragment, useState } from "react";
import type { NovelUsagePage } from "@ai-novel/shared/types/llmUsage";
import { InvocationDetail } from "./InvocationDetail";
import { formatUsageDuration, usageTokensPerSecond, formatUsageTokens, usageStageLabel, usageStatusLabel, usageTime } from "../presentation";

export function UsageLogTable({ items, novelId, focusedId, onJump }: { items: NovelUsagePage["items"]; novelId: string; focusedId?: string; onJump: (id: string) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [collapsedFocus, setCollapsedFocus] = useState<string | null>(null);
  const isExpanded = (id: string) => expanded === id || (focusedId === id && collapsedFocus !== id);
  const toggle = (id: string) => {
    const open = isExpanded(id);
    setExpanded(open ? null : id);
    if (focusedId === id) setCollapsedFocus(open ? id : null);
  };
  if (!items.length) return <p className="py-8 text-sm text-muted-foreground">没有符合筛选条件的调用记录。</p>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[1150px] text-left text-xs">
    <thead className="border-b border-border/60 text-muted-foreground"><tr>{["开始时间", "章节与步骤", "厂商与模型", "输入 Tokens", "输出 Tokens", "累计 Tokens", "耗时 / TTFT", "输出 tok/s", "重试 / 输出方式", "调用状态"].map(label => <th key={label} className="px-3 py-3 font-normal first:pl-0">{label}</th>)}</tr></thead>
    <tbody className="divide-y divide-border/50">{items.map(item => <Fragment key={item.invocationId}>
      <tr id={`usage-${item.invocationId}`} className={`align-top ${focusedId === item.invocationId ? "bg-muted/50" : ""}`}>
        <td className="whitespace-nowrap py-4 pr-3">{usageTime(item.startedAt)}</td>
        <td className="max-w-64 px-3 py-4"><p className="font-medium">{item.chapter ? `第 ${item.chapter.order} 章 · ${item.chapter.title}` : item.chapterId ? "章节信息未记录" : "书级 / 未归属章节"}</p><p className="mt-1 text-muted-foreground">{usageStageLabel(item.stage)}</p>
          <button type="button" className="mt-2 text-primary underline-offset-4 hover:underline" aria-expanded={isExpanded(item.invocationId)} onClick={() => toggle(item.invocationId)}>{isExpanded(item.invocationId) ? "收起消息与尝试链" : "查看消息与尝试链"}</button>
        </td>
        <td className="max-w-52 break-words px-3 py-4"><p>{item.provider ?? "厂商未记录"}</p><p className="mt-1 text-muted-foreground">{item.model ?? "模型未记录"}</p></td>
        <td className="whitespace-nowrap px-3 py-4 tabular-nums"><p className="font-medium">{formatUsageTokens(item.promptTokens)}</p><div className="mt-1 space-y-1 text-[11px] text-muted-foreground"><p>命中 {cacheCount(item, "cacheHitTokens")}</p><p>未命中 {cacheCount(item, "cacheMissTokens")}</p></div></td>
        <td className="px-3 py-4 tabular-nums">{formatUsageTokens(item.completionTokens)}</td>
        <td className="px-3 py-4 font-medium tabular-nums">{formatUsageTokens(item.totalTokens)}</td>
        <td className="whitespace-nowrap px-3 py-4 tabular-nums">{formatUsageDuration(item.durationMs)}<p className="mt-1 text-muted-foreground">TTFT {formatUsageDuration(item.firstTokenMs)}</p></td>
        <td className="px-3 py-4 tabular-nums" title="输出 Tokens ÷ 调用总耗时（秒）">{usageTokensPerSecond(item.completionTokens, item.durationMs)}</td>
        <td className="px-3 py-4">重试 {item.attemptNumber - 1} 次<p className="mt-1 text-muted-foreground">{item.structuredMode ?? "文本输出"}</p></td>
        <td className="whitespace-nowrap px-3 py-4"><span className={item.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{usageStatusLabel(item.status)}</span></td>
      </tr>
      {isExpanded(item.invocationId) ? <tr><td colSpan={10} className="bg-muted/20 px-4"><InvocationDetail novelId={novelId} invocationId={item.invocationId} onJump={onJump} /></td></tr> : null}
    </Fragment>)}</tbody>
  </table></div>;
}

function cacheCount(item: NovelUsagePage["items"][number], key: "cacheHitTokens" | "cacheMissTokens"): string {
  return item.inputCache.cacheUsageStatus === "invalid" ? "统计不可用" : item.inputCache.cacheUsageStatus === "reported" ? formatUsageTokens(item.inputCache[key]) : "未提供";
}
