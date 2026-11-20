import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, FilePenLine, History, ListTree, MessageSquareText, Sparkles } from "lucide-react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import {
  exportOutline, getOutline, getOutlineBookBinding,
  listOutlineRevisions, saveOutline, type OutlineProject,
} from "@/api/outlines";
import { Button } from "@/components/ui/button";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import { featureFlags } from "@/config/featureFlags";
import { CharacterImpactPanel } from "./characterImpact/CharacterImpactPanel";
import { OutlineFeedbackPanel, shouldShowOutlineFeedbackPanel } from "./OutlineFeedbackPanel";
import { OutlineConversation } from "./workspace/OutlineConversation";
import { OutlineRevisionPanel } from "./OutlineRevisionPanel";
import { findOutlineNode, type OutlineNode } from "./outlineNodes";
import { OutlineDirectory } from "./workspace/OutlineDirectory";
import { OutlineNodeEditor } from "./workspace/OutlineNodeEditor";
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
  function rememberDiscussion(person: string) {
    try { window.localStorage.setItem(bookmarkKey, person); } catch { /* Server history is still available by selecting the person. */ }
  }
  const [pane, setPane] = useState<Pane>(fromIdea || feedbackLink || lastDiscussion ? "assistant" : "editor");
  const [inspector, setInspector] = useState<Inspector>(feedbackLink ? "feedback" : "suggestions");
  const [request, setRequest] = useState("");
  const [characterRequests, setCharacterRequests] = useState<Record<string, string>>({});
  const [wholeForCharacter, setWholeForCharacter] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ baseVersion: number; document: OutlineDocument } | null>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["outline", id], queryFn: () => getOutline(id) });
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
    await Promise.all(["outline", "outline-revisions", "outline-book-binding", "outlines"].map(key =>
      client.invalidateQueries({ queryKey: key === "outlines" ? [key] : [key, id] })));
  };
  const save = useMutation({
    mutationFn: () => saveOutline(id, draft!.baseVersion, draft!.document),
    onSuccess: async result => {
      client.setQueryData<OutlineProject>(["outline", id], old => old && ({
        ...old, currentVersion: result.revision.version, document: result.document, title: result.document.story.title,
      }));
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
  const selectNode = (id: string) => { setNodeId(id); setPane("editor"); setWholeForCharacter(null); };
  useEffect(() => { if (requestedNode) { setNodeId(requestedNode); setPane("editor"); } }, [requestedNode]);
  useEffect(() => { if (feedbackLink) { setPane("assistant"); setInspector("feedback"); } }, [feedbackLink]);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [hasUnsavedChanges]);

  const selected = document && (nodeId && nodeId !== "story" ? findOutlineNode(document, nodeId) ?? (nodeId === lastDiscussion ? document.story : undefined) : document.story);
  const selectedCharacter = selected && "appearanceNodeIds" in selected ? selected : null;

  function updateField(field: string, value: string | boolean) {
    const saved = query.data;
    if (!selected || !saved?.document || writing) return;
    const savedDocument = saved.document;
    const original = findOutlineNode(savedDocument, selected.nodeId);
    function edit<T extends OutlineNode>(node: T) {
      const next = { ...node, [field]: value };
      if (value === "" && original && !(field in original)) delete (next as Record<string, unknown>)[field];
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

  return <div className="outline-workspace mx-auto max-w-[1800px]">
    <header className="outline-workspace-heading">
      <div className="min-w-0">
        <Link className="mb-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary" to="/outlines" onClick={guardLeave}><ArrowLeft size={13} />我的大纲</Link>
        <h1 className="truncate text-2xl font-semibold tracking-tight" title={query.data?.title}>{query.data?.title}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
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
      <button type="button" aria-pressed={pane === "editor"} onClick={() => setPane("editor")}><FilePenLine />编辑</button>
      <button type="button" aria-pressed={pane === "assistant"} onClick={() => setPane("assistant")}><Sparkles />协作与历史</button>
    </div>
    <div className="outline-workspace-grid" data-pane={pane}>
      <OutlineDirectory document={document} selectedId={selected?.nodeId ?? ""} onSelect={selectNode} disabled={writing || hasConflict}
        onAdd={(next, newId) => {
          setDraft({ baseVersion: draft?.baseVersion ?? version, document: next });
          selectNode(newId);
        }} />
      <section aria-label="大纲内容编辑" className="outline-editor">
        {selected ? <OutlineNodeEditor key={selected.nodeId} document={document} node={selected} disabled={writing} onChange={updateField}
          onSelect={selectNode} onReviewCharacter={() => {
            setWholeForCharacter(null); rememberDiscussion(selected.nodeId);
            setInspector("suggestions"); setPane("assistant");
            requestAnimationFrame(() => inspectorRef.current?.querySelector<HTMLTextAreaElement>('[aria-label="人物联动审阅"] textarea')?.focus());
          }} /> : <div className="outline-editor-fields"><p>这条内容在此修订中不存在。</p><Button variant="ghost" onClick={() => selectNode(document.story.nodeId)}>查看总纲</Button></div>}
        <footer className="outline-save-bar">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              {!draft && <Check size={14} aria-hidden />}{draft ? `有未保存的修改 · 基于 v${draft.baseVersion}` : `已保存 · v${version}`}</span>
            <div className="flex items-center gap-1">
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
        </footer>
      </section>

      <aside ref={inspectorRef} aria-label="大纲建议与历史" className="outline-inspector">
        <div className="outline-inspector-nav" role="group" aria-label="审阅工具">
          <button aria-pressed={activeInspector === "suggestions"} onClick={() => setInspector("suggestions")}><Sparkles />AI 协作</button>
          <button aria-pressed={activeInspector === "history"} onClick={() => setInspector("history")}><History />修订历史</button>
          {showFeedback && <button aria-pressed={activeInspector === "feedback"} onClick={() => setInspector("feedback")}><MessageSquareText />章节反馈</button>}
        </div>
        <div className="outline-inspector-body" data-conversation={activeInspector === "suggestions"}>
          {draft && <p role="status" className="mb-4 text-sm text-muted-foreground">先保存手动修改，再生成建议或采用其他版本。</p>}
          <div hidden={activeInspector !== "suggestions"} className="outline-conversations">
            {selectedCharacter && <div className="outline-scope" role="group" aria-label="对话范围">
              <button type="button" aria-pressed={wholeForCharacter !== selectedCharacter.nodeId}
                onClick={() => { setWholeForCharacter(null); rememberDiscussion(selectedCharacter.nodeId); }}>人物 · {selectedCharacter.name}</button>
              <button type="button" aria-pressed={wholeForCharacter === selectedCharacter.nodeId}
                onClick={() => { setWholeForCharacter(selectedCharacter.nodeId); rememberDiscussion("story"); }}>整份大纲</button>
            </div>}
            {selectedCharacter && wholeForCharacter !== selectedCharacter.nodeId
              ? query.data?.document?.characters.some(person => person.nodeId === selectedCharacter.nodeId)
                ? <CharacterImpactPanel key={selectedCharacter.nodeId} projectId={id} version={version}
                    characterId={selectedCharacter.nodeId} document={document} dirty={blockRevision}
                    requestText={characterRequests[selectedCharacter.nodeId] ?? ""}
                    onRequestChange={text => setCharacterRequests(previous => ({ ...previous, [selectedCharacter.nodeId]: text }))}
                    onDiscuss={() => rememberDiscussion(selectedCharacter.nodeId)} onApplied={refresh} />
                : <p className="p-4 text-sm text-muted-foreground">先保存这个人物，再讨论关联卷章与伏笔。</p>
              : <OutlineConversation projectId={id} version={version} document={document} starting={fromIdea}
                  dirty={blockRevision} value={request} onChange={setRequest} onDiscuss={() => rememberDiscussion("story")}
                  onApplied={async () => {
                    if (fromIdea) setParams(previous => { previous.delete("start"); return previous; }, { replace: true });
                    await refresh();
                  }} />}
          </div>
          {activeInspector === "history" && <OutlineRevisionPanel outlineId={id} currentVersion={version} document={document} restoreDisabled={blockRevision} onRestored={refresh} />}
          {showFeedback && <div hidden={activeInspector !== "feedback"}><OutlineFeedbackPanel outlineId={id} bound={!!bindingQuery.data} applyDisabled={blockRevision} document={document} /></div>}
        </div>
      </aside>
    </div>
  </div>;
}
