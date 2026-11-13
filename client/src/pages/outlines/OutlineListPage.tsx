import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import { Button } from "@/components/ui/button";
import {
  confirmOutlineImport,
  createOutline,
  listOutlines,
  previewOutlineImport,
  type OutlineImportPreview as OutlineImportPreviewData,
} from "@/api/outlines";
import { OutlineImportPreview } from "./OutlineImportPreview";
import { featureFlags } from "@/config/featureFlags";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";

export default function OutlineListPage() {
  const navigate = useNavigate();
  const isMobileViewport = useIsMobileViewport();
  const client = useQueryClient();
  const [importText, setImportText] = useState("");
  const [preview, setPreview] = useState<OutlineImportPreviewData | null>(null);
  const query = useQuery({ queryKey: ["outlines"], queryFn: listOutlines });
  const create = useMutation({
    mutationFn: (title: string) => createOutline(title),
    onSuccess: async result => {
      await client.invalidateQueries({ queryKey: ["outlines"] });
      navigate(`/outlines/${result.project.id}`);
    },
  });
  const parse = useMutation({
    mutationFn: () => previewOutlineImport({
      title: "导入的大纲",
      text: importText,
      format: /^\s*#/m.test(importText) ? "markdown" : "text",
    }),
    onSuccess: result => setPreview(result),
  });
  const confirm = useMutation({
    mutationFn: (document: OutlineDocument) => confirmOutlineImport(preview!.token, document),
    onSuccess: async result => {
      setPreview(null);
      await client.invalidateQueries({ queryKey: ["outlines"] });
      navigate(`/outlines/${result.project.id}`);
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">大纲</h1>
          <p className="mt-2 text-sm text-muted-foreground">先整理故事方向，再逐步完善卷、章节和人物。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => create.mutate("未命名大纲")} disabled={create.isPending}>空白大纲</Button>
          <Button onClick={() => create.mutate("新故事大纲")} disabled={create.isPending}>从一个想法开始</Button>
        </div>
      </header>
      {create.isError ? <p role="alert" className="text-sm text-destructive">{create.error instanceof Error ? create.error.message : "大纲创建失败，请重试。"}</p> : null}

      <section className="space-y-3 border-b border-border/50 pb-5">
        <div>
          <h2 className="font-medium">导入 Markdown 或 TXT</h2>
          <p className="mt-1 text-sm text-muted-foreground">粘贴大纲文本，确认识别出的标题、层级和引用后再创建项目。</p>
        </div>
        <textarea
          aria-label="要导入的大纲文本"
          className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="粘贴大纲文本；解析结果会先展示给你确认。"
          value={importText}
          onChange={event => setImportText(event.target.value)}
        />
        <Button variant="outline" disabled={!importText.trim() || parse.isPending} onClick={() => parse.mutate()}>
          {parse.isPending ? "正在解析…" : "解析并预览"}
        </Button>
        {parse.isError ? <p role="alert" className="text-sm text-destructive">{parse.error instanceof Error ? parse.error.message : "文本解析失败，请重试。"}</p> : null}
        {preview ? (
          <OutlineImportPreview
            key={preview.token}
            preview={preview}
            isConfirming={confirm.isPending}
            error={confirm.error}
            onConfirm={document => confirm.mutate(document)}
          />
        ) : null}
      </section>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">正在读取大纲项目…</p>
      ) : query.isError ? (
        <p role="alert" className="text-sm text-destructive">大纲项目读取失败，请稍后重试。</p>
      ) : query.data?.length ? (
        <ul className="divide-y divide-border/60">
          {query.data.map(item => (
            <li key={item.id} className="flex items-center justify-between gap-4 py-5">
              <div>
                <h2 className="font-medium">{item.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">修订 v{item.currentVersion} · {new Date(item.updatedAt).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2">
                {featureFlags.outlineFeedbackEnabled && !isMobileViewport && item.boundNovelId ? (
                  <Button asChild variant="ghost"><Link to={`/outlines/${item.id}#outline-feedback-panel`}>章节反馈</Link></Button>
                ) : null}
                <Button asChild variant="ghost"><Link to={`/outlines/${item.id}`}>继续编辑</Link></Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <section className="py-14 text-center">
          <h2 className="text-lg font-medium">从一个故事想法开始</h2>
          <p className="mt-2 text-sm text-muted-foreground">大纲会独立保存，不需要先创建小说。</p>
        </section>
      )}
    </div>
  );
}
