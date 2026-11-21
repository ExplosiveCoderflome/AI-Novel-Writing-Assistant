import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BookOpen, FileUp, Plus, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import { Button } from "@/components/ui/button";
import {
  confirmOutlineImport, createOutline, listOutlines, previewOutlineImport,
  type OutlineImportPreview as OutlineImportPreviewData,
} from "@/api/outlines";
import { OutlineImportPreview } from "./OutlineImportPreview";
import { featureFlags } from "@/config/featureFlags";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";

export default function OutlineListPage() {
  const navigate = useNavigate();
  const isMobileViewport = useIsMobileViewport();
  const client = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [preview, setPreview] = useState<OutlineImportPreviewData | null>(null);
  const query = useQuery({ queryKey: ["outlines"], queryFn: listOutlines });
  const create = useMutation({
    mutationFn: (mode: "idea" | "blank") => createOutline(mode === "idea" ? "新故事大纲" : "未命名大纲"),
    onSuccess: async (result, mode) => {
      await client.invalidateQueries({ queryKey: ["outlines"] });
      navigate(`/outlines/${result.project.id}${mode === "idea" ? "?start=idea" : ""}`);
    },
  });
  const parse = useMutation({
    mutationFn: () => previewOutlineImport({
      title: "导入的大纲", text: importText, format: /^\s*#/m.test(importText) ? "markdown" : "text",
    }),
    onSuccess: setPreview,
  });
  const confirm = useMutation({
    mutationFn: (document: OutlineDocument) => confirmOutlineImport(preview!.token, document),
    onSuccess: async result => {
      setPreview(null);
      await client.invalidateQueries({ queryKey: ["outlines"] });
      navigate(`/outlines/${result.project.id}`);
    },
  });
  const projects = query.data ?? [];
  return <div className="mx-auto w-full max-w-5xl py-3 sm:py-6">
    <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div><h1 className="text-3xl font-semibold tracking-tight">大纲工作台</h1>
        <p className="mt-2 text-sm text-muted-foreground">从一句故事想法起草，逐卷安排章节、人物和伏笔。</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => create.mutate("idea")} disabled={create.isPending}><Sparkles size={16} />从一个想法开始</Button>
        <Button variant="outline" onClick={() => create.mutate("blank")} disabled={create.isPending}><Plus size={16} />空白大纲</Button>
        <Button variant="ghost" aria-expanded={importOpen} aria-controls="outline-import" onClick={() => setImportOpen(open => !open)}><FileUp size={16} />导入大纲</Button>
      </div>
    </header>
    {create.isError && <p role="alert" className="mb-4 text-sm text-destructive">{create.error.message}</p>}

    <section hidden={!importOpen} id="outline-import" aria-label="导入大纲" className="mb-8 space-y-3 rounded-lg bg-muted/40 p-4 sm:p-5">
      <label className="block space-y-2"><span className="text-sm font-medium">粘贴 Markdown 或 TXT 大纲</span>
        <textarea aria-label="要导入的大纲文本" rows={4} className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="粘贴后可以检查卷章层级和人物引用。" value={importText} disabled={parse.isPending || confirm.isPending}
          onChange={event => { setImportText(event.target.value); setPreview(null); parse.reset(); }} />
      </label>
      <Button variant="outline" disabled={!importText.trim() || parse.isPending || confirm.isPending} onClick={() => parse.mutate()}>
        {parse.isPending ? "正在解析…" : "解析并预览"}
      </Button>
      {parse.isError && <p role="alert" className="text-sm text-destructive">{parse.error.message}</p>}
      {preview && <OutlineImportPreview key={preview.token} preview={preview} isConfirming={confirm.isPending}
        error={confirm.error} onConfirm={document => confirm.mutate(document)} />}
    </section>

    <section aria-label="我的大纲">
      <div className="flex items-baseline gap-2 border-b border-border/70 pb-3">
        <h2 className="text-lg font-semibold">我的大纲</h2>{query.isSuccess && <span className="text-sm tabular-nums text-muted-foreground">{projects.length}</span>}
      </div>
      {query.isLoading ? <p role="status" className="py-6 text-sm text-muted-foreground">正在读取大纲…</p>
        : query.isError ? <p role="alert" className="py-6 text-sm text-destructive">大纲列表读取失败。<Button size="sm" variant="ghost" onClick={() => void query.refetch()}>重试</Button></p>
        : projects.length ? <ul className="divide-y divide-border/50">{projects.map(item =>
          <li key={item.id} className="flex items-center gap-2 py-1">
            <Link to={`/outlines/${item.id}`} className="group flex min-w-0 flex-1 items-center gap-4 rounded-sm py-4">
              <BookOpen size={20} aria-hidden className="shrink-0 text-muted-foreground group-hover:text-primary" />
              <div className="min-w-0 flex-1"><h3 className="truncate font-medium group-hover:text-primary">{item.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">修订 v{item.currentVersion} · <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleDateString()}</time> 更新{item.boundNovelId && " · 已开书"}</p>
              </div><ArrowRight size={16} aria-hidden className="mr-1 shrink-0 text-muted-foreground group-hover:text-primary" />
            </Link>
            {featureFlags.outlineFeedbackEnabled && !isMobileViewport && item.boundNovelId && <Button asChild size="sm" variant="ghost">
              <Link to={`/outlines/${item.id}#outline-feedback-panel`}>章节反馈</Link></Button>}
          </li>)}</ul>
        : <div className="py-8"><h3 className="font-medium">还没有大纲</h3><p className="mt-1 text-sm text-muted-foreground">选“从一个想法开始”，写下主角和遇到的难题，就能预览第一份大纲。</p></div>}
    </section>
  </div>;
}
