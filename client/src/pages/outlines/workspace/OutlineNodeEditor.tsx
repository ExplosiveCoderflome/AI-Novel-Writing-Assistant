import { formatVolumeBeatDisplayLabel } from "@ai-novel/shared/types/volumeBeatSlots";
import { ArrowUpRight } from "lucide-react";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import { formatOutlineValue, getOutlineNodes, getOutlineNodeTitle, outlineFieldLabels, type OutlineNode } from "../outlineNodes";

const forms = {
  story: { label: "总纲", main: ["premise", "synopsis"], more: ["endingDirection", "theme", "tone", "genre", "targetAudience", "notes"] },
  volume: { label: "卷", main: ["summary", "promise"], more: ["pressure", "protagonistChange", "climax", "endingHook", "planningDepth"] },
  chapter: { label: "章节", main: ["summary", "conflict"], more: ["purpose", "emotionalBeat", "endingHook", "planningDepth"] },
  character: { label: "人物", main: ["role", "summary", "goal", "motivation"], more: ["conflict", "secret", "arcDirection"] },
  payoff: { label: "伏笔与钩子", main: ["setupDescription", "payoffDescription"], more: ["kind"] },
  fact: { label: "固定设定", main: ["content"], more: ["category", "immutable"] },
};

const prompts: Record<string, string> = {
  premise: "谁想达成什么目标？是什么打乱了原本的生活？",
  synopsis: "从故事开端写到最终抉择，先记下主线即可。",
  summary: "这段故事从哪里开始？结束时发生了什么变化？",
  role: "这个人是谁？与主角有什么关系？",
  goal: "这个人最想得到什么？",
  motivation: "为什么这件事对这个人如此重要？",
  setupDescription: "读者会在哪里第一次留意到这条线索？",
  payoffDescription: "真相揭晓时，读者会重新理解什么？",
};

export function formFor(node: OutlineNode) {
  if ("premise" in node) return forms.story;
  if ("volumeNodeId" in node) return forms.chapter;
  if ("chapterNodeIds" in node) return forms.volume;
  if ("appearanceNodeIds" in node) return forms.character;
  if ("setupChapterNodeIds" in node) return forms.payoff;
  return forms.fact;
}

export function references(node: OutlineNode): string[] {
  if ("chapterNodeIds" in node) return node.chapterNodeIds;
  if ("volumeNodeId" in node) return [node.volumeNodeId, ...node.characterNodeIds, ...node.payoffNodeIds];
  if ("appearanceNodeIds" in node) return node.appearanceNodeIds;
  if ("setupChapterNodeIds" in node) return [...node.setupChapterNodeIds, ...node.payoffChapterNodeIds, ...node.relatedNodeIds];
  if ("scope" in node) return node.scope.nodeId ? [...node.relatedNodeIds, node.scope.nodeId] : node.relatedNodeIds;
  return [];
}

interface Props {
  node: OutlineNode;
  document: OutlineDocument;
  disabled: boolean;
  onChange: (field: string, value: string | boolean) => void;
  onSelect: (id: string) => void;
}

export function OutlineNodeEditor({ node, document, disabled, onChange, onSelect }: Props) {
  const form = formFor(node);
  const titleField = "name" in node ? "name" : "title";
  const current = node as unknown as Record<string, unknown>;
  const parent = "volumeNodeId" in node ? document.volumes.find(volume => volume.nodeId === node.volumeNodeId) : undefined;
  const outgoing = new Set(references(node));
  const related = getOutlineNodes(document).filter(other =>
    other !== node && (outgoing.has(other.nodeId) || references(other).includes(node.nodeId)));

  function field(key: string) {
    const characterSummary = key === "summary" && "appearanceNodeIds" in node;
    const label = characterSummary ? "人物说明" : outlineFieldLabels[key];
    if (key === "immutable") return <label key={key} className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={!!current[key]} disabled={disabled} className="accent-primary"
        onChange={event => onChange(key, event.target.checked)} />情节发展必须遵守这条设定
    </label>;
    const choices = key === "planningDepth" ? ["rough", "detailed"] : key === "kind" ? ["foreshadowing", "hook", "promise", "mystery", "other"] : null;
    return <label key={key} className="block space-y-2">
      <span className="text-sm font-medium">{label}</span>
      {choices ? <select className="outline-field" disabled={disabled} value={String(current[key] ?? "")}
        onChange={event => onChange(key, event.target.value)}>
        {choices.map(value => <option key={value} value={value}>{formatOutlineValue(value, key)}</option>)}
      </select> : <textarea className="outline-field outline-textarea" rows={key === "synopsis" || key === "summary" || key === "content" ? 4 : 2}
        disabled={disabled} value={String(current[key] ?? "")} placeholder={characterSummary ? "写下这个人的来历和处境。" : prompts[key]} onChange={event => onChange(key, event.target.value)} />}
    </label>;
  }

  return <div className="outline-editor-fields">
    <header className="mb-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{parent ? `${parent.title} / ${form.label}` : form.label}</span>
      </div>
      <input className="outline-title" aria-label={outlineFieldLabels[titleField]} disabled={disabled}
        placeholder={titleField === "name" ? "填写人物姓名" : "填写标题"} value={String(current[titleField])}
        onChange={event => onChange(titleField, event.target.value)} />
    </header>
    {parent?.beats && <label className="mb-4 block space-y-2 text-sm">所属节奏段
      <select className="outline-field" disabled={disabled} value={String(current.beatKey ?? "")} onChange={e=>onChange("beatKey",e.target.value)}>
        <option value="">暂未关联</option>{parent.beats.map(b=><option key={b.key} value={b.key}>{formatVolumeBeatDisplayLabel(b)}</option>)}
      </select></label>}
    <div className="space-y-5">{form.main.map(field)}</div>
    <details className="outline-more">
      <summary>更多{form.label === "固定设定" ? "选项" : "设定"}</summary>
      <div className="space-y-5 pt-4">{form.more.map(field)}</div>
    </details>
    {related.length > 0 && <section className="border-t border-border/50 pt-4" aria-label="关联内容">
      <h3 className="mb-2 text-sm font-medium">关联内容 <span className="text-xs font-normal text-muted-foreground">{related.length}</span></h3>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">{related.map(item => <li key={item.nodeId}>
        <button className="inline-flex items-center gap-1 py-1 text-left text-sm text-primary hover:underline" type="button" onClick={() => onSelect(item.nodeId)}>
          {getOutlineNodeTitle(item)}<ArrowUpRight aria-hidden size={12} />
        </button>
      </li>)}</ul>
    </section>}
  </div>;
}
