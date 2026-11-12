import type { OutlineBookPolicy } from "@ai-novel/shared/types/outlineOpenBook";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import { findOutlineNodeTitle, formatOutlineValue, outlineFieldLabels } from "@/pages/outlines/outlineNodes";

export function OutlinePreservationDetails({policy,document}:{policy:OutlineBookPolicy;document:OutlineDocument}) {
  const groups = [
    {mode:"hard_constraint",label:"不可违背的固定设定"},
    {mode:"preserve",label:"已填写内容 · 保留原文"},
    {mode:"fill_missing",label:"空白字段 · 可补充"},
    {mode:"propose_change",label:"允许提出优化建议"},
  ];
  return <div className="space-y-4 text-sm" aria-label="保留字段明细">{groups.map(group=>{
    const rules=policy.rules.filter(rule=>rule.mode===group.mode);
    return rules.length ? <details key={group.mode} open={group.mode==="hard_constraint"}>
      <summary className="cursor-pointer py-1 font-medium">{group.label}（{rules.length} 项）</summary>
      <dl className="mt-2 max-h-64 divide-y divide-border/40 overflow-y-auto pr-2">{rules.map(rule=><div key={`${rule.nodeId}:${rule.field}`} className="py-2">
        <dt className="text-xs text-muted-foreground">{findOutlineNodeTitle(document,rule.nodeId)} · {outlineFieldLabels[rule.field] ?? "创作内容"}</dt>
        <dd className="mt-1 whitespace-pre-wrap break-words leading-6">{rule.mode==="fill_missing" ? "交给 AI 补充" : formatOutlineValue(rule.value,rule.field,document)}</dd>
      </div>)}</dl>
    </details> : null;
  })}</div>;
}
