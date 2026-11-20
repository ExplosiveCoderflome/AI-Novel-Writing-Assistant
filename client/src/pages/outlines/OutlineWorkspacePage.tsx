import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, FilePenLine, History, ListTree, MessageSquareText, Sparkles } from "lucide-react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import {
  applyOutlineProposal, exportOutline, generateOutlineProposal, getOutline, getOutlineBookBinding,
  listOutlineRevisions, saveOutline, type OutlineProject, type OutlineProposal, type OutlineProposalKind,
} from "@/api/outlines";
import { Button } from "@/components/ui/button";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import { featureFlags } from "@/config/featureFlags";
import { CharacterImpactPanel } from "./characterImpact/CharacterImpactPanel";
import { OutlineFeedbackPanel, shouldShowOutlineFeedbackPanel } from "./OutlineFeedbackPanel";
import { OutlineProposalPanel } from "./OutlineProposalPanel";
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
  const [nodeId, setNodeId] = useState(requestedNode);
  const [pane, setPane] = useState<Pane>(fromIdea || feedbackLink ? "assistant" : "editor");
  const [inspector, setInspector] = useState<Inspector>(feedbackLink ? "feedback" : "suggestions");
  const [proposalKind, setProposalKind] = useState<OutlineProposalKind>(fromIdea ? "initial_generation" : "edit");
  const [request, setRequest] = useState("");
  const [characterRequests, setCharacterRequests] = useState<Record<string, string>>({});
  const [showGeneralSuggestions, setShowGeneralSuggestions] = useState(false);
  const [proposal, setProposal] = useState<OutlineProposal | null>(null);
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
    + useIsMutating({ mutationKey: ["outline-revision-decision", id] });
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
  const propose = useMutation({
    mutationFn: () => generateOutlineProposal(id, request, proposalKind),
    onSuccess: setProposal,
  });
  const apply = useMutation({
    mutationFn: (operations: string[]) => applyOutlineProposal(id, proposal!.id, operations),
    onSuccess: async () => {
      setProposal(null);
      if (proposal?.kind === "initial_generation") {
        setPane("editor"); setNodeId(null); setProposalKind("edit"); setRequest("");
        setParams(previous => { previous.delete("start"); previous.delete("nodeId"); return previous; }, { replace: true });
      }
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
  const writing = save.isPending || apply.isPending || nestedDecisions > 0;
  const blockRevision = !!draft || writing;
  const selectNode = (id: string) => { setNodeId(id); setPane("editor"); };
  useEffect(() => { if (requestedNode) { setNodeId(requestedNode); setPane("editor"); } }, [requestedNode]);
  useEffect(() => { if (feedbackLink) { setPane("assistant"); setInspector("feedback"); } }, [feedbackLink]);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [hasUnsavedChanges]);

  const selected = document && (nodeId && nodeId !== "story" ? findOutlineNode(document, nodeId) : document.story);
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
        <div className="outline-inspector-body">
          {draft && <p role="status" className="mb-4 text-sm text-muted-foreground">先保存手动修改，再生成建议或采用其他版本。</p>}
          <div hidden={activeInspector !== "suggestions"} className="space-y-5">
            {selectedCharacter && query.data?.document?.characters.some(person => person.nodeId === selectedCharacter.nodeId) && <CharacterImpactPanel key={JSON.stringify([id, version, selectedCharacter.nodeId])} projectId={id} version={version}
              characterId={selectedCharacter.nodeId} document={document} dirty={blockRevision}
              requestText={characterRequests[selectedCharacter.nodeId] ?? ""}
              onRequestChange={text => setCharacterRequests(previous => ({ ...previous, [selectedCharacter.nodeId]: text }))}
              onApplied={refresh} />}
            {selectedCharacter && <button type="button" aria-expanded={showGeneralSuggestions} aria-controls="outline-general-suggestions"
              className="text-sm font-medium text-primary hover:underline" onClick={() => setShowGeneralSuggestions(open => !open)}>
              {showGeneralSuggestions ? "收起整份大纲的 AI 建议" : "查看整份大纲的 AI 建议"}
            </button>}
            <section id="outline-general-suggestions" hidden={!!selectedCharacter && !showGeneralSuggestions} className="space-y-3">
              <label className="block space-y-2 text-sm font-medium">希望 AI 帮你做什么？
                <select className="outline-field" aria-label="AI 建议类型" value={proposalKind} disabled={propose.isPending}
                  onChange={event => setProposalKind(event.target.value as OutlineProposalKind)}>
                  <option value="edit">调整当前大纲</option><option value="initial_generation">从想法生成初版</option>
                </select>
              </label>
              <label className="block space-y-2 text-sm font-medium">{proposalKind === "initial_generation" ? "你的故事想法" : "你的修改要求"}
                <textarea autoFocus={fromIdea} aria-label={proposalKind === "initial_generation" ? "你的故事想法" : "给 AI 的修改要求"}
                  rows={4} className="outline-field outline-textarea" placeholder={proposalKind === "initial_generation" ? "例如：一个能替人保存记忆的女孩，发现自己最想找回的那段记忆属于别人。" : "例如：把第二卷的真相揭晓推迟到结尾，保留主角和妹妹的和解。"}
                  value={request} onChange={event => setRequest(event.target.value)} />
              </label>
              <p className="text-xs leading-relaxed text-muted-foreground">先查看建议和影响范围，采纳后保存为新修订。</p>
              <Button className="w-full" disabled={!request.trim() || blockRevision || propose.isPending} onClick={() => propose.mutate()}>
                {propose.isPending ? "正在生成建议…" : proposalKind === "initial_generation" ? "生成大纲建议" : "提出修改建议"}</Button>
              {propose.isError && <p role="alert" className="text-sm text-destructive">{propose.error.message}</p>}
              {proposal && <>
                {proposal.baseVersion !== version && <p role="status" className="text-sm text-warning">这份建议基于旧修订，请重新生成后采纳。</p>}
                <OutlineProposalPanel key={proposal.id} proposal={proposal} document={document} isApplying={apply.isPending}
                  applyDisabled={blockRevision || proposal.baseVersion !== version} onApply={ids => apply.mutate(ids)} onDiscard={() => setProposal(null)} />
              </>}
              {apply.isError && <p role="alert" className="text-sm text-destructive">{apply.error.message}</p>}
            </section>
          </div>
          {activeInspector === "history" && <OutlineRevisionPanel outlineId={id} currentVersion={version} document={document} restoreDisabled={blockRevision} onRestored={refresh} />}
          {showFeedback && <div hidden={activeInspector !== "feedback"}><OutlineFeedbackPanel outlineId={id} bound={!!bindingQuery.data} applyDisabled={blockRevision} document={document} /></div>}
        </div>
      </aside>
    </div>
  </div>;
}
