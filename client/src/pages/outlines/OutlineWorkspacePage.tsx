import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  applyOutlineProposal,
  exportOutline,
  generateOutlineProposal,
  getOutline,
  listOutlineRevisions,
  getOutlineBookBinding,
  saveOutline,
  type OutlineProposal,
  type OutlineProposalKind,
} from "@/api/outlines";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import { Button } from "@/components/ui/button";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import { OutlineProposalPanel } from "./OutlineProposalPanel";
import { OutlineFeedbackPanel } from "./OutlineFeedbackPanel";
import { OutlineRevisionPanel } from "./OutlineRevisionPanel";
import "./outlineWorkspace.css";
import { getOutlineNodeTitle, outlineFieldLabels, type OutlineNode } from "./outlineNodes";

export default function OutlineWorkspacePage() {
  const { id = "" } = useParams();
  return <OutlineWorkspace key={id} id={id} />;
}

function OutlineWorkspace({ id }: { id: string }) {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["outline", id], queryFn: () => getOutline(id), enabled: !!id });
  const revisionQuery = useQuery({ queryKey: ["outline-revisions", id], queryFn: () => listOutlineRevisions(id), enabled: !!id });
  const bindingQuery = useQuery({ queryKey: ["outline-book-binding", id], queryFn: () => getOutlineBookBinding(id), enabled: !!id });
  const currentRevisionId = revisionQuery.data?.find(revision => revision.version === query.data?.currentVersion)?.id ?? "";
  const [draft, setDraft] = useState<{ baseVersion: number; document: OutlineDocument } | null>(null);
  const document = draft?.document ?? query.data?.document;
  const [node, setNode] = useState("story");
  useEffect(()=>{const requested=searchParams.get("nodeId");if(requested)setNode(requested);},[id,searchParams]);
  const [request, setRequest] = useState("");
  const [proposal, setProposal] = useState<OutlineProposal | null>(null);
  const [proposalKind, setProposalKind] = useState<OutlineProposalKind>("edit");
  const [showHistory, setShowHistory] = useState(false);
  const isMobileViewport = useIsMobileViewport();
  const hasUnsavedChanges = draft !== null;
  const hasConflict = !!draft && draft.baseVersion !== query.data?.currentVersion;

  const refreshOutline = async () => {
    await queryClient.invalidateQueries({ queryKey: ["outline", id] });
  };
  const save = useMutation({
    mutationFn: () => saveOutline(id, draft!.baseVersion, draft!.document),
    onError: refreshOutline,
    onSuccess: async result => {
      queryClient.setQueryData<typeof query.data>(["outline", id], current => current && result.revision.version >= current.currentVersion
        ? { ...current, document: result.document, currentVersion: result.revision.version }
        : current);
      setDraft(null);
      setProposal(null);
      await queryClient.invalidateQueries({ queryKey: ["outline-revisions", id] });
      await refreshOutline();
    },
  });
  const propose = useMutation({
    mutationFn: () => generateOutlineProposal(id, request, proposalKind),
    onSuccess: value => setProposal(value),
  });
  const apply = useMutation({
    mutationFn: (operationIds: string[]) => applyOutlineProposal(id, proposal!.id, operationIds),
    onSuccess: async () => {
      setProposal(null);
      await queryClient.invalidateQueries({ queryKey: ["outline-revisions", id] });
      await refreshOutline();
    },
  });

  const selected = useMemo<OutlineNode | undefined>(() => {
    if (!document) return undefined;
    if (node === "story" || document.story.nodeId === node) return document.story;
    return [
      ...document.volumes,
      ...document.chapters,
      ...document.characters,
      ...document.payoffs,
      ...document.facts,
    ].find(item => item.nodeId === node);
  }, [document, node]);

  if (query.isLoading || (!document && !query.isError)) return <p className="text-sm text-muted-foreground">正在打开大纲…</p>;
  if (!document) return <p role="alert" className="text-sm text-destructive">大纲读取失败，请返回列表后重试。</p>;

  const updateSelectedField = (field: string, value: string) => {
    if (!query.data?.document || save.isPending || apply.isPending) return;
    const saved = query.data;
    setDraft(previous => {
      const current = previous?.document ?? saved.document!;
      const baseVersion = previous?.baseVersion ?? saved.currentVersion;
      const edit = (next: OutlineDocument) => baseVersion === saved.currentVersion && JSON.stringify(next) === JSON.stringify(saved.document)
        ? null : { baseVersion, document: next };
      if (node === "story" || current.story.nodeId === node) {
        return edit({ ...current, story: { ...current.story, [field]: value } });
      }
      for (const collection of ["volumes", "chapters", "characters", "payoffs", "facts"] as const) {
        if (current[collection].some(item => item.nodeId === node)) {
          return edit({
            ...current,
            [collection]: current[collection].map(item => item.nodeId === node ? { ...item, [field]: value } : item),
          } as OutlineDocument);
        }
      }
      return previous;
    });
  };

  const download = async (format: "json" | "markdown") => {
    const value = await exportOutline(id, format);
    const url = URL.createObjectURL(new Blob([typeof value === "string" ? value : JSON.stringify(value, null, 2)], { type: "text/plain;charset=utf-8" }));
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${query.data?.title}.${format === "json" ? "json" : "md"}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const directory = [
    { label: "总纲", items: [{ id: "story", label: document.story.title }] },
    {
      label: "卷与章节",
      items: [
        ...document.volumes.map(item => ({ id: item.nodeId, label: item.title })),
        ...document.chapters.map(item => ({ id: item.nodeId, label: `　${item.title}` })),
      ],
    },
    { label: "人物", items: document.characters.map(item => ({ id: item.nodeId, label: item.name })) },
    { label: "伏笔与钩子", items: document.payoffs.map(item => ({ id: item.nodeId, label: item.title })) },
    { label: "固定设定", items: document.facts.map(item => ({ id: item.nodeId, label: item.title })) },
  ];
  const selectedFields = selected
    ? Object.entries(selected as unknown as Record<string, unknown>).filter(([key, value]) => key !== "nodeId" && key !== "volumeNodeId" && typeof value === "string") as Array<[string, string]>
    : [];

  return (
    <div className="outline-workspace mx-auto max-w-[1800px]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{query.data?.title} <span className="text-sm font-normal text-muted-foreground">· 修订 v{query.data?.currentVersion}</span></h1>
          <p className="mt-1 text-xs text-muted-foreground">大纲内容独立保存；AI 建议需要你确认后才会成为新修订。</p>
        </div>
        <div className="flex gap-2">
          {!isMobileViewport ? (!bindingQuery.isSuccess || (!bindingQuery.data && (!currentRevisionId || hasUnsavedChanges)) ? <Button disabled>按这份大纲开书</Button> : <Button asChild><Link to={bindingQuery.data ? bindingQuery.data.sourceRoute : `/outlines/${id}/open-book?revisionId=${encodeURIComponent(currentRevisionId)}`}>{bindingQuery.data ? "继续这本书" : "按这份大纲开书"}</Link></Button>) : null}
          <Button variant="ghost" onClick={() => setShowHistory(current => !current)}>{showHistory ? "收起历史" : "历史"}</Button>
          <Button variant="ghost" onClick={() => download("json")}>导出 JSON</Button>
          <Button variant="ghost" onClick={() => download("markdown")}>导出 Markdown</Button>
        </div>
      </header>

      {bindingQuery.data ? <p className="shrink-0 text-xs leading-6 text-muted-foreground">已绑定《{bindingQuery.data.title}》 · 固定采用修订 v{bindingQuery.data.revisionVersion}{bindingQuery.data.currentVersion!==bindingQuery.data.revisionVersion ? ` · 源大纲当前为 v${bindingQuery.data.currentVersion}，本书不会自动同步` : ""}</p> : bindingQuery.isError ? <p role="alert" className="shrink-0 text-xs text-destructive">绑定信息读取失败，请刷新后再开书，避免重复创建。</p> : hasUnsavedChanges ? <p className="shrink-0 text-xs text-muted-foreground">先保存本地修改，再按这份修订开书。</p> : null}
      <OutlineFeedbackPanel outlineId={id} bound={!!bindingQuery.data} />
      <div className="outline-workspace-grid">
        <nav aria-label="大纲目录" className="outline-directory space-y-5 border-b border-border/50 pb-4 xl:border-b-0 xl:border-r xl:pr-3">
          {directory.map(group => (
            <section key={group.label}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h2>
              {group.items.map(item => (
                <button
                  key={item.id}
                  onClick={() => setNode(item.id)}
                  className={`block w-full truncate rounded px-2 py-1.5 text-left text-sm ${node === item.id ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {item.label}
                </button>
              ))}
            </section>
          ))}
        </nav>

        <section aria-label="大纲内容编辑" className="outline-editor min-w-0">
          {selected ? (
            <>
              <div className="outline-editor-fields space-y-4">
                <h2 className="text-lg font-semibold">{getOutlineNodeTitle(selected)}</h2>
                {selectedFields.map(([key, value]) => (
                  <label key={key} className="block space-y-1.5">
                    <span className="text-sm text-muted-foreground">{outlineFieldLabels[key] ?? key}</span>
                    <textarea
                      disabled={save.isPending || apply.isPending}
                      rows={4}
                      className="outline-textarea min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2.5 text-sm leading-6"
                      value={value}
                      onChange={event => updateSelectedField(key, event.target.value)}
                    />
                  </label>
                ))}
              </div>
              <div className="outline-save-bar sticky bottom-0 z-10 border-t border-border/50 bg-background py-3">
                <div className="flex flex-wrap items-center justify-end gap-3">
                  {save.isSuccess && !hasUnsavedChanges ? <span className="text-xs text-muted-foreground">已保存为新修订</span> : null}
                  <Button onClick={() => save.mutate()} disabled={!hasUnsavedChanges || hasConflict || save.isPending || apply.isPending}>{save.isPending ? "保存中…" : "保存为新修订"}</Button>
                </div>
                {hasConflict ? <p role="alert" className="mt-2 text-sm text-warning">
                  另一个版本已保存。请复制要保留的修改，再载入最新修订。
                  <Button size="sm" variant="ghost" onClick={() => {
                    if (window.confirm("载入最新修订会替换编辑框里的未保存修改。继续吗？")) setDraft(null);
                  }}>载入最新修订</Button>
                </p> : hasUnsavedChanges ? <p role="status" className="mt-2 text-sm text-muted-foreground">请先保存手改内容，再根据新修订生成和采纳 AI 建议。</p> : null}
                {save.isError ? <p role="alert" className="mt-2 text-sm text-destructive">{save.error instanceof Error ? save.error.message : "保存失败，请重试。"}</p> : null}
              </div>
            </>
          ) : <p className="text-sm text-muted-foreground">选择目录中的内容进行编辑。</p>}
        </section>

        <aside aria-label="大纲建议与历史" className="outline-inspector space-y-4 border-t border-border/50 pt-4 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
          <div>
            <h2 className="font-semibold">AI 协作</h2>
            <p className="mt-1 text-sm text-muted-foreground">告诉 AI 你希望调整什么，建议会先展示给你检查。</p>
          </div>
          <select
            aria-label="AI 建议类型"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={proposalKind}
            onChange={event => setProposalKind(event.target.value as OutlineProposalKind)}
          >
            <option value="edit">调整当前大纲</option>
            <option value="initial_generation">从想法生成初版</option>
          </select>
          <textarea
            aria-label="给 AI 的修改要求"
            rows={4}
            className="outline-textarea min-h-28 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm leading-6"
            placeholder={proposalKind === "initial_generation" ? "用一句话描述你想写的故事" : "例如：让第二卷的节奏更紧凑，并加入一条感情线"}
            value={request}
            onChange={event => setRequest(event.target.value)}
          />
          <Button className="w-full" onClick={() => propose.mutate()} disabled={!request.trim() || hasUnsavedChanges || save.isPending || apply.isPending || propose.isPending}>
            {propose.isPending ? "正在生成建议…" : proposalKind === "initial_generation" ? "生成大纲建议" : "提出修改建议"}
          </Button>
          {propose.isError ? <p role="alert" className="text-sm text-destructive">{propose.error instanceof Error ? propose.error.message : "建议生成失败，请重试。"}</p> : null}
          {proposal && !hasUnsavedChanges && proposal.baseVersion !== query.data?.currentVersion ? (
            <p role="status" className="text-sm text-warning">这份建议基于旧修订，请重新生成后采纳。</p>
          ) : null}
          {proposal ? (
            <OutlineProposalPanel
              key={proposal.id}
              proposal={proposal}
              document={document}
              isApplying={apply.isPending}
              applyDisabled={hasUnsavedChanges || save.isPending || proposal.baseVersion !== query.data?.currentVersion}
              onApply={operationIds => apply.mutate(operationIds)}
              onDiscard={() => setProposal(null)}
            />
          ) : null}
          {apply.isError ? (
            <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>{apply.error instanceof Error ? apply.error.message : "采纳失败，请刷新大纲后重试。"}</p>
              <p className="text-xs text-muted-foreground">请根据当前大纲重新生成建议，再检查并采纳。</p>
              <Button type="button" size="sm" variant="secondary" onClick={() => { setProposal(null); apply.reset(); }}>
                重新生成建议
              </Button>
            </div>
          ) : null}
          {showHistory ? (
            <OutlineRevisionPanel
              outlineId={id}
              currentVersion={query.data?.currentVersion ?? 0}
              document={document}
              onRestored={() => { void refreshOutline(); }}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}
