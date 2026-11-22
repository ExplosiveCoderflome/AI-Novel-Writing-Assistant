import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Plus, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import { Button } from "@/components/ui/button";
import {
  confirmOutlineImport, createOutline, listOutlines, previewOutlineImport,
  type OutlineImportPreview as OutlineImportPreviewData,
} from "@/api/outlines";
import { OutlineImportPreview } from "./OutlineImportPreview";
import { OutlineLibrary, OutlineSamplePage } from "./library/OutlineLibrary";
import "./library/outlineLibrary.css";

export default function OutlineListPage() {
  const navigate = useNavigate();
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
  const empty = query.isSuccess && projects.length === 0;
  const actions = <div className="outline-library-actions">
    <Button onClick={() => create.mutate("idea")} disabled={create.isPending}><Sparkles size={16} />从一个想法开始</Button>
    <Button variant="outline" onClick={() => create.mutate("blank")} disabled={create.isPending}><Plus size={16} />空白大纲</Button>
    <Button variant="ghost" aria-expanded={importOpen} aria-controls="outline-import" onClick={() => setImportOpen(open => !open)}><FileUp size={16} />导入大纲</Button>
  </div>;
  return <div className="outline-catalog">
    <header className="outline-catalog-heading">
      <div><h1>大纲工作台</h1>
        {!empty && <p>从一句故事想法起草，逐卷安排章节、人物和伏笔。</p>}</div>
      {!empty && actions}
    </header>
    {empty && <section aria-labelledby="outline-empty-heading" className="outline-library-empty">
      <div className="outline-empty-copy">
        <h2 id="outline-empty-heading">写下你的第一份大纲</h2>
        <p>主角是谁？遇到了什么难题？从一句话开始，和 AI 一起把故事排成卷和章。</p>
        {actions}
      </div>
      <OutlineSamplePage />
    </section>}
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

    {query.isLoading && <p role="status" className="py-6 text-sm text-muted-foreground">正在读取大纲…</p>}
    {query.isError && <p role="alert" className="py-6 text-sm text-destructive">大纲列表读取失败。<Button size="sm" variant="ghost" onClick={() => void query.refetch()}>重试</Button></p>}
    {projects.length > 0 && <OutlineLibrary projects={projects} />}
  </div>;
}
