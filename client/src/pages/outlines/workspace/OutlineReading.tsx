import { BeatList } from "./volumeRhythm/BeatList";
import type { ReactNode } from "react";
import { useIsMutating, useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, BookOpen, Feather, PencilLine } from "lucide-react";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import type { PendingOutlineProposal } from "@/api/outlines";
import { Button } from "@/components/ui/button";
import { findOutlineNodeTitle, formatOutlineValue, getOutlineNodes, getOutlineNodeTitle, outlineFieldLabels, type OutlineNode } from "../outlineNodes";
import { formatVolumeBeatDisplayLabel } from "@ai-novel/shared/types/volumeBeatSlots";
import { formFor, references } from "./OutlineNodeEditor";
import { outlineReviewThread } from "./outlineReviewThread";

export function isEmptyOutline(doc: OutlineDocument) {
  return !Object.entries(doc.story).some(([key, value]) => key !== "title" && key !== "nodeId" && value)
    && ![doc.volumes, doc.chapters, doc.characters, doc.facts, doc.payoffs].some(group => group.length);
}

export function IdeaStarter({ projectId, value, onChange, busy, onGenerate, onDiscuss, onEdit, children }: {
  projectId: string; value: string; onChange: (text: string) => void; busy: boolean;
  onGenerate: () => void; onDiscuss: () => void; onEdit: () => void; children: ReactNode;
}) {
  const thread = outlineReviewThread(projectId);
  const history = useQuery({ queryKey: thread.queryKey, queryFn: thread.load });
  const sending = useIsMutating({ mutationKey: thread.queryKey, exact: true }) > 0;
  const manual = <button type="button" className="outline-blank-edit" onClick={onEdit}>自己填写大纲</button>;
  if (!history.data) return <div className="outline-reading">
    {history.isError ? <p role="alert">故事讨论读取失败。<Button variant="ghost" onClick={() => void history.refetch()}>重试</Button></p>
      : <p role="status">正在读取故事讨论…</p>}
    {manual}
  </div>;
  if (history.data.length) return <div className="outline-idea-thread">
    {children}
    <div className="outline-idea-next">
      <Button variant="secondary" disabled={busy || sending || history.data.some(turn => turn.status === "running")} onClick={onGenerate}>
        根据讨论生成初稿 <ArrowRight />
      </Button>
      {manual}
    </div>
  </div>;
  return <><article className="outline-reading outline-idea">
    <Feather size={32} aria-hidden="true" />
    <h2>你想写一个什么故事？</h2>
    <p>写下一个人、一个困境，或你一直想写的画面。初稿会把它展开成卷章和人物，读过后由你决定是否采用。</p>
    <label htmlFor="outline-story-idea">我的故事想法</label>
    <textarea id="outline-story-idea" value={value} maxLength={6000} rows={5} placeholder="如果有一天……"
      disabled={busy} onChange={e => onChange(e.target.value)} />
    <div className="outline-reading-actions"><Button disabled={busy || !value.trim()} onClick={onGenerate}>根据这个想法生成初稿 <ArrowRight /></Button>
      <Button variant="ghost" disabled={busy} onClick={onDiscuss}>先帮我想一想</Button></div>
  </article>{manual}</>;
}

export function PendingSuggestions({ proposals, version, document, onOpen }: {
  proposals: PendingOutlineProposal[]; version: number; document: OutlineDocument; onOpen: (id: string) => void;
}) {
  if (!proposals.length) return null;
  return <section className="outline-pending" aria-label="待处理的建议">
    <h3>等你看的建议 <small>{proposals.length}</small></h3>
    {proposals.map(item => <button type="button" key={item.id} onClick={() => onOpen(item.id)}>
      <span><b>{item.title || item.requestText || (item.characterId ? findOutlineNodeTitle(document, item.characterId) + "的人物修改" : "大纲修改")}</b>
        <small>{item.baseVersion === version ? `基于 v${version} · 待采纳` : `基于 v${item.baseVersion} · 与当前 v${version} 对照`}</small></span><ArrowRight size={16} />
    </button>)}
  </section>;
}

export function OutlineReading({ document, node, version, onEdit, reviewAction, renderLocalReview, notices, volumeRhythm, onSelect }: {
  document: OutlineDocument; node: OutlineNode; version: number; onEdit: () => void; onSelect: (id: string) => void;
  reviewAction?: ReactNode; renderLocalReview?: (passages: ReactNode) => ReactNode; notices?: ReactNode; volumeRhythm?: ReactNode;
}) {
  const form = formFor(node);
  const isStory = node.nodeId === document.story.nodeId;
  const person = "appearanceNodeIds" in node ? node : null;
  const fields = node as unknown as Record<string, unknown>;
  const links = new Set(references(node));
  const related = getOutlineNodes(document).filter(other => other !== node && (links.has(other.nodeId) || references(other).includes(node.nodeId)));
  const link = (item: OutlineNode) => <button className="outline-reading-link" type="button" key={item.nodeId} onClick={() => onSelect(item.nodeId)}>{getOutlineNodeTitle(item)} <ArrowUpRight size={13} /></button>;
  const title = getOutlineNodeTitle(node);
  const passages = <>
      {"volumeNodeId" in node && node.beatKey && <p className="outline-reading-counts">所属节奏段 · {formatVolumeBeatDisplayLabel(document.volumes.find(v=>v.nodeId===node.volumeNodeId)?.beats?.find(b=>b.key===node.beatKey) ?? {key:node.beatKey})}</p>}
      {notices}
      {isStory && <p className="outline-reading-counts">{document.volumes.length} 卷 <i>·</i> {document.chapters.length} 章 <i>·</i> {document.characters.length} 位人物</p>}
      {[...form.main, ...form.more].filter(key => fields[key] !== undefined && fields[key] !== "" && key !== "planningDepth").map(key => <section className="outline-passage" key={key}>
        <h3>{person && key === "summary" ? "人物说明" : outlineFieldLabels[key]}</h3><p>{formatOutlineValue(fields[key], key, document)}</p>
      </section>)}
      {volumeRhythm}
      {isStory && <>
        {!!document.volumes.length && <section className="outline-passage"><h3>卷章安排</h3>{[...document.volumes].sort((a,b) => a.order-b.order).map(vol =>
          <details key={vol.nodeId} className="outline-volume"><summary>{vol.title} <small>{vol.chapterNodeIds.length} 章</small></summary>
            <p>{vol.summary}</p>
            {vol.beats && <BeatList beats={vol.beats} chapters={document.chapters.filter(ch=>ch.volumeNodeId===vol.nodeId)} onSelect={onSelect}/>}
            <div>{vol.chapterNodeIds.map(id => document.chapters.find(ch => ch.nodeId === id)).map(ch => ch && !ch.beatKey && link(ch))}</div>
          </details>)}</section>}
        {!!document.characters.length && <section className="outline-passage"><h3>人物</h3><div className="outline-person-list">{document.characters.map(p => <div key={p.nodeId}>{link(p)}<p>{p.role || p.summary}</p></div>)}</div></section>}
      </>}
      {person && <section className="outline-passage"><h3>出场卷章</h3>
        {related.filter(item => "volumeNodeId" in item || "chapterNodeIds" in item).map(link)}
        {!related.some(item => "volumeNodeId" in item || "chapterNodeIds" in item) && <p>还没有安排出场。</p>}</section>}
      {related.some(item => !person || !("volumeNodeId" in item || "chapterNodeIds" in item)) && <section className="outline-passage" aria-label="关联内容"><h3>关联内容</h3>
        {related.filter(item => !person || !("volumeNodeId" in item || "chapterNodeIds" in item)).map(link)}</section>}
  </>;
  return <article className={reviewAction ? "outline-reading outline-local-page" : "outline-reading"}>
    <header className="outline-reading-heading">
      <div className="outline-reading-meta"><span><BookOpen size={14} /> {form.label} · 当前稿 v{version}</span><button onClick={onEdit}><PencilLine size={14} /> 手动编辑</button></div>
      <div className="outline-reading-title"><h2 title={title}>{title}</h2>{reviewAction}</div>
    </header>
    {renderLocalReview ? renderLocalReview(passages) : <div className="outline-reading-body">{passages}</div>}
  </article>;
}
