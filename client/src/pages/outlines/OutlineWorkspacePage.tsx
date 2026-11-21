import { WorkspaceColumns } from "@/components/layout/resizableWorkspace";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Feather, FilePenLine, History, ListTree, MessageSquareText, Sparkles } from "lucide-react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import {
  exportOutline, getOutline, getOutlineBookBinding,
  listOutlineRevisions, listPendingOutlineProposals, saveOutline, type OutlineProject,
} from "@/api/outlines";
import { Button } from "@/components/ui/button";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import { featureFlags } from "@/config/featureFlags";
import { VolumeRhythm } from "./workspace/volumeRhythm/VolumeRhythm";
import { OutlineLocalReview, type LocalReviewDraft } from "./workspace/OutlineLocalReview";
import type { LocalTarget } from "./workspace/outlineReviewThread";
import { OutlineFeedbackPanel, shouldShowOutlineFeedbackPanel } from "./OutlineFeedbackPanel";
import { OutlineConversation } from "./workspace/OutlineConversation";
import { OutlineRevisionPanel } from "./OutlineRevisionPanel";
import { findOutlineNode, getOutlineNodeTitle, type OutlineNode } from "./outlineNodes";
import { OutlineDirectory } from "./workspace/OutlineDirectory";
import { OutlineNodeEditor } from "./workspace/OutlineNodeEditor";
import { IdeaStarter, isEmptyOutline, OutlineReading, PendingSuggestions } from "./workspace/OutlineReading";
import { OutlineReviewReading } from "./workspace/OutlineReviewReading";
import { useOutlineReviewTurn } from "./workspace/useOutlineReviewTurn";
import "./outlineWorkspace.css";

type Pane = "directory" | "editor" | "assistant";
type Inspector = "suggestions" | "history" | "feedback";

export default function OutlineWorkspacePage() {
  const { id = "" } = useParams();
  return <OutlineWorkspace key={id} id={id} />;
}

function OutlineWorkspace({ id }: { id: string }) {
  const [params, setParams] = useSearchParams();
  const { hash } = useLocation();
  const fromIdea = params.get("start") === "idea";
  const feedbackLink = hash === "#outline-feedback-panel";
  const requestedNode = params.get("nodeId");
  const bookmarkKey = `outline-character-discussion:${id}`;
  const [lastDiscussion] = useState(() => {
    try { return !requestedNode && !fromIdea && !feedbackLink ? window.localStorage.getItem(bookmarkKey) : null; }
    catch { return null; }
  });
  const [nodeId, setNodeId] = useState(requestedNode ?? (lastDiscussion === "story" ? null : lastDiscussion));
  function rememberDiscussion(node: string) {
    try { window.localStorage.setItem(bookmarkKey, node); } catch { /* Direct links and server history still work. */ }
  }
  const [pane, setPane] = useState<Pane>(feedbackLink ? "assistant" : "editor");
  const inspectorKey = `outline-inspector-open:${id}`;
  const [inspectorOpen, setInspectorOpen] = useState(() => {
    try { return feedbackLink || window.localStorage.getItem(inspectorKey) !== "false"; }
    catch { return true; }
  });
  const [inspector, setInspector] = useState<Inspector>(feedbackLink ? "feedback" : "suggestions");
  const [localEditorId, setLocalEditorId] = useState<string | null>(null);
  const [ready, setReady] = useState<{target: LocalTarget; proposalId?: string} | null>(null);
  const [editing, setEditing] = useState(false);
  const [receipt, setReceipt] = useState<number | null>(null);
  const reviewId = params.get("proposalId");
  const [request, setRequest] = useState("");
  const [localDrafts, setLocalDrafts] = useState<Record<string, LocalReviewDraft>>({});
  const [draft, setDraft] = useState<{ baseVersion: number; document: OutlineDocument } | null>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["outline", id], queryFn: () => getOutline(id) });
  const pending = useQuery({ queryKey: ["outline-pending", id], queryFn: () => listPendingOutlineProposals(id) });
  const revisionQuery = useQuery({ queryKey: ["outline-revisions", id], queryFn: () => listOutlineRevisions(id) });
  const bindingQuery = useQuery({ queryKey: ["outline-book-binding", id], queryFn: () => getOutlineBookBinding(id) });
  const isMobileViewport = useIsMobileViewport();
  const showFeedback = shouldShowOutlineFeedbackPanel({ flagEnabled: featureFlags.outlineFeedbackEnabled, bound: !!bindingQuery.data, isMobile: isMobileViewport });
  const activeInspector = inspector === "feedback" && !showFeedback ? "suggestions" : inspector;
  const version = query.data?.currentVersion ?? 0;
  const currentRevisionId = revisionQuery.data?.find(item => item.version === version)?.id;
  const document = draft?.document ?? query.data?.document;
  const hasUnsavedChanges = draft !== null;
  const hasConflict = !!draft && draft.baseVersion !== version;
  const nestedDecisions = useIsMutating({ mutationKey: ["outline-character-impact-decision", id] })
    + useIsMutating({ mutationKey: ["outline-revision-decision", id] })
    + useIsMutating({ mutationKey: ["outline-discussion-decision", id] });
  const refresh = async () => {
    await Promise.all(["outline", "outline-revisions", "outline-book-binding", "outline-pending", "outlines"].map(key =>
      client.invalidateQueries({ queryKey: key === "outlines" ? [key] : [key, id] })));
  };
  const save = useMutation({
    mutationFn: () => saveOutline(id, draft!.baseVersion, draft!.document),
    onSuccess: async result => {
      client.setQueryData<OutlineProject>(["outline", id], old => {
        if (!old || result.revision.version < old.currentVersion) return old;
        return { ...old, currentVersion: result.revision.version, document: result.document, title: result.document.story.title };
      });
      setDraft(null);
      await refresh();
    },
    onError: () => query.refetch().then(() => undefined),
  });
  const download = useMutation({
    mutationFn: async (format: "json" | "markdown") => {
      const value = await exportOutline(id, format);
      const url = URL.createObjectURL(new Blob([typeof value === "string" ? value : JSON.stringify(value, null, 2)], { type: "text/plain;charset=utf-8" }));
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `${query.data?.title}.${format === "json" ? "json" : "md"}`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });
  const writing = save.isPending || nestedDecisions > 0;
  const blockRevision = !!draft || writing;
  function setInspectorVisibility(open: boolean) {
    setInspectorOpen(open);
    try { window.localStorage.setItem(inspectorKey, String(open)); } catch { /* Keep the in-memory preference. */ }
  }
  function showInspector(tool: Inspector) {
    setInspector(tool);
    if (starter && tool === "suggestions") {
      setPane("editor");
      return;
    }
    setInspectorVisibility(true);
    setPane("assistant");
  }
  function closeInspector() {
    setInspectorVisibility(false);
    setPane("editor");
  }
  function toggleInspector(tool: Inspector) {
    // In the single-pane layout the author can be reading while the side-by-side preference stays open.
    const panel = inspectorRef.current;
    if (inspectorOpen && activeInspector === tool && panel && window.getComputedStyle(panel).display !== "none") closeInspector();
    else showInspector(tool);
  }
  function navigateContent(node: string | null, proposal?: string, returnToReview?: string) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      if (node) next.set("nodeId", node); else next.delete("nodeId");
      if (proposal) next.set("proposalId", proposal); else next.delete("proposalId");
      if (returnToReview) next.set("returnProposalId", returnToReview); else next.delete("returnProposalId");
      if (node) next.delete("start");
      return next;
    }, { replace: true });
    setNodeId(node);
    setPane("editor");
  }
  function selectNode(node: string) { setEditing(!!draft); navigateContent(node); }
  function openReview(proposalId: string, targetNodeId?: string) {
    setReady(null); setReceipt(null); setEditing(false); navigateContent(targetNodeId ?? nodeId, proposalId);
  }
  function showLocalResult(target: LocalTarget, proposalId?: string) {
    setReady(null);
    if (proposalId) openReview(proposalId, target.id);
    else { setEditing(false); navigateContent(target.id); setLocalEditorId(target.id); }
  }
  const turn = useOutlineReviewTurn(id, (proposalId, target) => {
    if (target && (target.id !== nodeId || draft)) setReady({target, proposalId});
    else if (target) showLocalResult(target, proposalId);
    else if (proposalId) openReview(proposalId);
    else showInspector("suggestions");
  });
  useEffect(() => { if (requestedNode) setNodeId(requestedNode); }, [requestedNode]);
  useEffect(() => { if (feedbackLink) showInspector("feedback"); }, [feedbackLink]);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [hasUnsavedChanges]);

  const selected = document && (nodeId && nodeId !== "story" ? findOutlineNode(document, nodeId) ?? (nodeId === lastDiscussion ? document.story : undefined) : document.story);
  const localTarget: LocalTarget | undefined = selected && "appearanceNodeIds" in selected ? {kind:"character", id:selected.nodeId}
    : selected && "chapterNodeIds" in selected ? {kind:"volume", id:selected.nodeId}
    : selected && "volumeNodeId" in selected ? {kind:"chapter", id:selected.nodeId} : undefined;
  const visiblePending = (pending.data ?? []).filter(p => {
    if (selected === document?.story) return !p.characterId && !p.chapterId && !p.volumeId;
    if (!selected) return false;
    const localOwner = p.characterId ?? p.chapterId ?? p.volumeId;
    return localOwner ? localOwner === selected.nodeId && (p.kind === "volume_beats" || p.baseVersion === version) : p.targetNodeIds?.includes(selected.nodeId);
  });
  const blank = !!document && isEmptyOutline(document);
  const starter = blank && !editing && !draft && !reviewId && selected === document?.story;
  const sideOpen = inspectorOpen && !(starter && activeInspector === "suggestions");

  function sendOpening(requestText: string, action?: "generate_initial") {
    const submitted = request;
    turn.send({ requestText, action, baseVersion: version }, {
      onSuccess: () => setRequest(current => current === submitted ? "" : current),
    });
  }

  function updateField(field: string, value: string | boolean) {
    const saved = query.data;
    if (!selected || !saved?.document || writing) return;
    const savedDocument = saved.document;
    const original = findOutlineNode(savedDocument, selected.nodeId);
    function edit<T extends OutlineNode>(node: T) {
      const next = { ...node, [field]: value };
      if (value === "" && (field === "beatKey" || original && !(field in original))) delete (next as Record<string, unknown>)[field];
      return next;
    }
    setDraft(previous => {
      const current = previous?.document ?? savedDocument;
      const baseVersion = previous?.baseVersion ?? saved.currentVersion;
      let next = current;
      if (selected.nodeId === current.story.nodeId) next = { ...current, story: edit(current.story) };
      else for (const key of ["volumes", "chapters", "characters", "payoffs", "facts"] as const) {
        if (current[key].some(item => item.nodeId === selected.nodeId)) {
          next = { ...current, [key]: current[key].map(item => item.nodeId === selected.nodeId ? edit(item) : item) };
          break;
        }
      }
      return baseVersion === saved.currentVersion && JSON.stringify(next) === JSON.stringify(savedDocument) ? null : { baseVersion, document: next };
    });
  }
  function guardLeave(event: MouseEvent<HTMLAnchorElement>) {
    if (draft && !event.ctrlKey && !event.metaKey && !window.confirm("离开会丢失未保存的修改。继续离开吗？")) event.preventDefault();
  }
  if (!document) return query.isLoading ? <p role="status">正在打开大纲…</p> : <div role="alert" className="space-x-3">
    <span>大纲读取失败。</span><Button variant="secondary" onClick={() => void query.refetch()}>重试</Button><Link to="/outlines">返回列表</Link>
  </div>;

  const localExpanded = !!localTarget && localEditorId === localTarget.id;
  const conversation = <OutlineConversation projectId={id} version={version} document={query.data!.document!} starting={fromIdea}
    dirty={blockRevision || turn.busy} value={request} onChange={setRequest} onSent={turnId => { rememberDiscussion("story"); turn.track(turnId); }}
    onOpenResult={prop => openReview(prop)} />;
  const reviewLabel = localExpanded ? "收起修改" : localTarget?.kind === "character" ? "修改" + getOutlineNodeTitle(selected)
    : localTarget?.kind === "volume" ? "调整本卷" : "调整本章";
  const readingNotices = <>
    {params.get("returnProposalId") && <button className="outline-reading-link px-4" onClick={() => openReview(params.get("returnProposalId")!)}><ArrowLeft size={14} />回到刚才的建议</button>}
    {pending.isError && <button className="outline-reading-link" onClick={() => void pending.refetch()}>重新读取待处理建议</button>}
    <PendingSuggestions document={document} proposals={visiblePending} version={version} onOpen={proposal => openReview(proposal, visiblePending.find(p => p.id === proposal)?.characterId ?? undefined)} />
  </>;
  return <div className="outline-workspace mx-auto max-w-[1800px]">
    <header className="outline-workspace-heading">
      <div className="min-w-0">
        <Link className="mb-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary" to="/outlines" onClick={guardLeave}><ArrowLeft size={13} />我的大纲</Link>
        <h1 className="truncate text-2xl font-semibold tracking-tight" title={query.data?.title}>{query.data?.title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!starter && <Button variant={inspectorOpen && activeInspector === "suggestions" ? "secondary" : "ghost"} size="sm" aria-expanded={inspectorOpen && activeInspector === "suggestions" && (pane === "assistant" || !isMobileViewport)} onClick={() => toggleInspector("suggestions")}><Sparkles />大纲助手</Button>}
        <Button variant={inspectorOpen && activeInspector === "history" ? "secondary" : "ghost"} size="sm" onClick={() => toggleInspector("history")}><History />版本历史</Button>
        <select aria-label="导出已保存的大纲" className="outline-export" value="" disabled={download.isPending || blockRevision}
          onChange={event => download.mutate(event.target.value as "markdown" | "json")}>
          <option value="" disabled>导出大纲</option><option value="markdown">Markdown 文稿</option><option value="json">JSON 数据</option>
        </select>
        {!isMobileViewport && (!bindingQuery.isSuccess || (!bindingQuery.data && (!currentRevisionId || blockRevision))
          ? <Button size="sm" disabled>按这份大纲开书</Button>
          : <Button asChild size="sm"><Link onClick={guardLeave} to={bindingQuery.data ? bindingQuery.data.sourceRoute : `/outlines/${id}/open-book?revisionId=${encodeURIComponent(currentRevisionId!)}`}>
            {bindingQuery.data ? "继续这本书" : "按这份大纲开书"}</Link></Button>)}
      </div>
    </header>
    {download.isError && <p role="alert" className="text-sm text-destructive">导出失败，请重新选择格式。</p>}
    {bindingQuery.data && <p className="text-xs text-muted-foreground">《{bindingQuery.data.title}》采用修订 v{bindingQuery.data.revisionVersion}{bindingQuery.data.currentVersion !== bindingQuery.data.revisionVersion && ` · 大纲修订 v${bindingQuery.data.currentVersion} 的改动仅保存在大纲中`}</p>}
    {bindingQuery.isError && <p role="alert" className="text-sm text-destructive">未能读取开书信息。<button className="underline" onClick={() => void bindingQuery.refetch()}>重新读取</button></p>}

    <div className="outline-pane-switch" role="group" aria-label="工作区视图">
      <button type="button" data-target="directory" aria-pressed={pane === "directory"} onClick={() => setPane("directory")}><ListTree />目录</button>
      <button type="button" aria-pressed={pane === "editor"} onClick={() => setPane("editor")}><FilePenLine />{starter ? "故事构思" : "大纲内容"}</button>
      <button type="button" aria-pressed={pane === "assistant"} onClick={() => showInspector(starter && activeInspector === "suggestions" ? "history" : activeInspector)}>{starter ? <><History />大纲记录</> : <><Sparkles />协作与历史</>}</button>
    </div>
    <WorkspaceColumns layoutId="outline" className="outline-workspace-grid" data-pane={pane} data-inspector-open={sideOpen} gap={0} minCenter={300}
      left={{ label: "调整大纲目录宽度", initial: "var(--outline-directory-width)", min: 144 }}
      right={sideOpen ? { label: "调整协作与历史宽度", initial: "var(--outline-inspector-width)", min: 260 } : undefined}>
      <OutlineDirectory document={document} selectedId={selected?.nodeId ?? ""} onSelect={selectNode} disabled={writing || hasConflict}
        onAdd={(next, newId) => {
          setDraft({ baseVersion: draft?.baseVersion ?? version, document: next });
          navigateContent(newId); setEditing(true);
        }} />
      <section aria-label="大纲内容编辑" className="outline-editor">
        {turn.busy && <div className="outline-activity" role="status"><Sparkles size={16} /> 正在整理建议…
          <button onClick={() => turn.target ? showLocalResult(turn.target) : showInspector("suggestions")}>{turn.target ? "查看本次修改" : "查看整书讨论"}</button></div>}
        {ready && <div className="outline-activity" role="status">「{getOutlineNodeTitle(findOutlineNode(document, ready.target.id))}」的修改有了回复。
          <button onClick={() => showLocalResult(ready.target, ready.proposalId)}>{ready.proposalId ? "查看建议" : "查看回复"}</button></div>}
        {turn.error && <p className="outline-activity" role="alert">{turn.error}<button onClick={turn.clearError}>关闭提示</button></p>}
        {receipt && <div className="outline-activity" role="status"><Check size={16} /> 已采纳为 v{receipt} <button onClick={() => showInspector("history")}>查看版本历史</button></div>}
        {reviewId ? <div key={reviewId} className="outline-reading-scroll"><OutlineReviewReading projectId={id} proposalId={reviewId} document={query.data!.document!} version={version}
          locked={blockRevision} busy={turn.busy} onReturn={ownerId => navigateContent(ownerId ?? nodeId)} onSelect={node => navigateContent(node, undefined, reviewId)}
          onRequest={(requestText, priorId, target) => {
            if (target && nodeId !== target.id) navigateContent(target.id, priorId);
            turn.send({requestText, priorId, target, baseVersion:version});
          }}
          onApplied={(appliedVersion, node) => { setReceipt(appliedVersion); setEditing(false); navigateContent(node ?? null); }} /></div>
        : !editing && selected ? <div className={starter ? "outline-reading-scroll outline-idea-page" : "outline-reading-scroll"} key={selected.nodeId}>
          {!localTarget && readingNotices}
          {starter ? <IdeaStarter projectId={id} value={request} onChange={setRequest} busy={turn.busy || blockRevision}
            onGenerate={() => sendOpening(request.trim() || "根据我们讨论的故事方向，生成第一版大纲。", "generate_initial")}
            onDiscuss={() => sendOpening(request.trim() ? `我想写这样的故事，请先问我一个问题，帮我想清楚方向。\n${request.trim()}`.slice(0,6000) : "我还没有具体的故事想法，请先问我一个问题，帮我找到方向。")}
            onEdit={() => setEditing(true)}>{conversation}</IdeaStarter>
            : <OutlineReading document={document} node={selected} version={version} onSelect={selectNode} onEdit={() => setEditing(true)}
              notices={localTarget && readingNotices}
              volumeRhythm={"chapterNodeIds" in selected && <VolumeRhythm projectId={id} version={version} onSelect={selectNode} volume={selected}
                chapters={document.chapters.filter(ch=>ch.volumeNodeId===selected.nodeId).sort((a,b)=>a.order-b.order)}
                disabled={blockRevision || turn.busy} onOpen={proposal=>openReview(proposal,selected.nodeId)}/>}
              reviewAction={localTarget && <Button type="button" size="sm" variant="secondary" className="outline-local-toggle"
                aria-expanded={localExpanded} aria-controls={localExpanded ? "outline-local-form" : undefined} title={reviewLabel}
                onClick={() => setLocalEditorId(localExpanded ? null : localTarget.id)}><Feather size={15} /><span>{reviewLabel}</span></Button>}
              renderLocalReview={localTarget && (passages => <OutlineLocalReview projectId={id} target={localTarget} title={getOutlineNodeTitle(selected)} version={version}
                expanded={localExpanded} disabled={blockRevision || turn.busy} draft={localDrafts[localTarget.id] ?? {text:""}}
                onExpand={() => setLocalEditorId(localTarget.id)} onChange={value => setLocalDrafts(prev => ({...prev,[localTarget.id]:value}))}
                onOpen={proposal => openReview(proposal, localTarget.id)} onSend={(requestText, priorId) => {
                  const submitted = localDrafts[localTarget.id];
                  turn.send({requestText, priorId, target:localTarget, baseVersion:version}, {onSuccess: () => {
                    rememberDiscussion(localTarget.id);
                    setLocalDrafts(prev => prev[localTarget.id] === submitted ? {...prev,[localTarget.id]:{text:""}} : prev);
                  }});
                }}>{passages}</OutlineLocalReview>)} />}
          </div>
        : selected ? <OutlineNodeEditor key={selected.nodeId} document={document} node={selected} disabled={writing} onChange={updateField}
          onSelect={selectNode} /> : <div className="outline-editor-fields"><p>这条内容在此修订中不存在。</p><Button variant="ghost" onClick={() => selectNode(document.story.nodeId)}>查看总纲</Button></div>}
        {(editing || draft) && <footer className="outline-save-bar">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              {!draft && <Check size={14} aria-hidden />}{draft ? `有未保存的修改 · 基于 v${draft.baseVersion}` : `已保存 · v${version}`}</span>
            <div className="flex items-center gap-1">
            {!draft && <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>回到阅读</Button>}
            {draft && !hasConflict && <Button size="sm" variant="ghost" disabled={writing} onClick={() => {
              if (window.confirm("放弃这份大纲中所有未保存的修改？")) {
                setDraft(null);
                if (nodeId && query.data?.document && !findOutlineNode(query.data.document, nodeId)) setNodeId(null);
              }
            }}>放弃修改</Button>}
            <Button size="sm" variant={draft ? "default" : "secondary"} disabled={!draft || hasConflict || writing} onClick={() => save.mutate()}>{save.isPending ? "保存中…" : "保存为新修订"}</Button>
            </div>
          </div>
          {hasConflict && <p role="alert" className="mt-2 text-sm text-warning">有更新的修订。请复制要保留的修改，再
            <button className="underline" onClick={() => { if (window.confirm("载入最新修订会替换未保存的修改。继续吗？")) setDraft(null); }}>载入最新修订</button>。</p>}
          {save.isError && <p role="alert" className="mt-2 text-sm text-destructive">{save.error.message}</p>}
        </footer>}
      </section>

      {(!starter || sideOpen) && <aside ref={inspectorRef} aria-label="大纲建议与历史" className="outline-inspector">
        <div className="outline-inspector-nav" role="group" aria-label="审阅工具">
          <button aria-pressed={activeInspector === "suggestions"} onClick={() => showInspector("suggestions")}><Sparkles />整书讨论</button>
          <button aria-pressed={activeInspector === "history"} onClick={() => setInspector("history")}><History />修订历史</button>
          {showFeedback && <button aria-pressed={activeInspector === "feedback"} onClick={() => setInspector("feedback")}><MessageSquareText />章节反馈</button>}
          <button className="outline-close-inspector" aria-label="收起侧栏" onClick={closeInspector}>收起</button>
        </div>
        <div className="outline-inspector-body" data-conversation={activeInspector === "suggestions"}>
          {draft && <p role="status" className="mb-4 text-sm text-muted-foreground">先保存手动修改，再生成建议或采用其他版本。</p>}
          {!starter && <div hidden={activeInspector !== "suggestions"} className="outline-conversations">{conversation}</div>}
          {activeInspector === "history" && <OutlineRevisionPanel outlineId={id} currentVersion={version} document={document} restoreDisabled={blockRevision} onRestored={refresh} />}
          {showFeedback && <div hidden={activeInspector !== "feedback"}><OutlineFeedbackPanel outlineId={id} bound={!!bindingQuery.data} applyDisabled={blockRevision} document={document} /></div>}
        </div>
      </aside>}
    </WorkspaceColumns>
  </div>;
}
