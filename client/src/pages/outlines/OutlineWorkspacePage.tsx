import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import {
  applyOutlineProposal,
  exportOutline,
  generateOutlineProposal,
  getOutline,
  saveOutline,
  type OutlineProposal,
  type OutlineProposalKind,
} from "@/api/outlines";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import { Button } from "@/components/ui/button";
import { OutlineProposalPanel } from "./OutlineProposalPanel";
import { OutlineRevisionPanel } from "./OutlineRevisionPanel";
import { getOutlineNodeTitle, outlineFieldLabels, type OutlineNode } from "./outlineNodes";

export default function OutlineWorkspacePage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["outline", id], queryFn: () => getOutline(id), enabled: !!id });
  const [document, setDocument] = useState<OutlineDocument | null>(null);
  const [node, setNode] = useState("story");
  const [request, setRequest] = useState("");
  const [proposal, setProposal] = useState<OutlineProposal | null>(null);
  const [proposalKind, setProposalKind] = useState<OutlineProposalKind>("edit");
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (query.data?.document) setDocument(query.data.document);
  }, [query.data]);

  const refreshOutline = async () => {
    await queryClient.invalidateQueries({ queryKey: ["outline", id] });
  };
  const save = useMutation({
    mutationFn: () => saveOutline(id, query.data!.currentVersion, document!),
    onSuccess: async () => {
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
  if (query.isError || !document) return <p role="alert" className="text-sm text-destructive">大纲读取失败，请返回列表后重试。</p>;

  const updateSelectedField = (field: string, value: string) => {
    setDocument(current => {
      if (!current) return current;
      if (node === "story" || current.story.nodeId === node) {
        return { ...current, story: { ...current.story, [field]: value } };
      }
      for (const collection of ["volumes", "chapters", "characters", "payoffs", "facts"] as const) {
        if (current[collection].some(item => item.nodeId === node)) {
          return {
            ...current,
            [collection]: current[collection].map(item => item.nodeId === node ? { ...item, [field]: value } : item),
          } as OutlineDocument;
        }
      }
      return current;
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
    ? Object.entries(selected as unknown as Record<string, unknown>).filter(([key, value]) => key !== "nodeId" && typeof value === "string") as Array<[string, string]>
    : [];

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{query.data?.title} <span className="text-sm font-normal text-muted-foreground">· 修订 v{query.data?.currentVersion}</span></h1>
          <p className="mt-1 text-xs text-muted-foreground">大纲内容独立保存；AI 建议需要你确认后才会成为新修订。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setShowHistory(current => !current)}>{showHistory ? "收起历史" : "历史"}</Button>
          <Button variant="ghost" onClick={() => download("json")}>导出 JSON</Button>
          <Button variant="ghost" onClick={() => download("markdown")}>导出 Markdown</Button>
        </div>
      </header>

      <div className="grid min-h-[70dvh] grid-cols-1 gap-6 lg:grid-cols-[230px_minmax(0,1fr)_360px]">
        <nav aria-label="大纲目录" className="space-y-5 border-b border-border/50 pb-4 lg:border-b-0 lg:border-r lg:pr-4">
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

        <section className="min-w-0 space-y-4">
          {selected ? (
            <>
              <h2 className="text-lg font-semibold">{getOutlineNodeTitle(selected)}</h2>
              {selectedFields.map(([key, value]) => (
                <label key={key} className="block space-y-1.5">
                  <span className="text-sm text-muted-foreground">{outlineFieldLabels[key] ?? key}</span>
                  <textarea
                    className="min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={value}
                    onChange={event => updateSelectedField(key, event.target.value)}
                  />
                </label>
              ))}
              <div className="flex items-center justify-end gap-3">
                {save.isSuccess ? <span className="text-xs text-muted-foreground">已保存为新修订</span> : null}
                <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "保存中…" : "保存为新修订"}</Button>
              </div>
              {save.isError ? <p role="alert" className="text-sm text-destructive">{save.error instanceof Error ? save.error.message : "保存失败，请重试。"}</p> : null}
            </>
          ) : <p className="text-sm text-muted-foreground">选择目录中的内容进行编辑。</p>}
        </section>

        <aside className="space-y-4 border-t border-border/50 pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
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
            className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder={proposalKind === "initial_generation" ? "用一句话描述你想写的故事" : "例如：让第二卷的节奏更紧凑，并加入一条感情线"}
            value={request}
            onChange={event => setRequest(event.target.value)}
          />
          <Button className="w-full" onClick={() => propose.mutate()} disabled={!request.trim() || propose.isPending}>
            {propose.isPending ? "正在生成建议…" : proposalKind === "initial_generation" ? "生成大纲建议" : "提出修改建议"}
          </Button>
          {propose.isError ? <p role="alert" className="text-sm text-destructive">{propose.error instanceof Error ? propose.error.message : "建议生成失败，请重试。"}</p> : null}
          {proposal ? (
            <OutlineProposalPanel
              key={proposal.id}
              proposal={proposal}
              document={document}
              isApplying={apply.isPending}
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
