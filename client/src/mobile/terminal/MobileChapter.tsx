import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Chapter } from "@ai-novel/shared/types/novel";
import { updateNovelChapter } from "@/api/novel";
import { useChapterDraft } from "@/pages/novels/components/chapterEditor/document";
import { Button } from "@/components/ui/button";

export function MobileChapter({ novelId, chapter }: { novelId: string; chapter: Chapter }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const draft = useChapterDraft({ novelId, chapter, busy: saving });
  async function save() {
    setSaving(true); setError("");
    const content = draft.contentDraft;
    try {
      const response = await updateNovelChapter(novelId, chapter.id, { content, expectedUpdatedAt: draft.savedUpdatedAt, expectedContent: draft.savedContent });
      if (!response.data) throw new Error("正文保存失败，请重试。");
      draft.acknowledgeSave(content, response.data);
      await queryClient.invalidateQueries({ queryKey: ["mobileNovel", novelId] });
      setEditing(false);
    } catch (error) { setError(error instanceof Error ? error.message : "正文保存失败，请重试。"); }
    finally { setSaving(false); }
  }
  return <article className="space-y-4 border-t pt-5">
    <h2 className="text-lg font-semibold">第 {chapter.order} 章 · {chapter.title}</h2>
    <p className="text-xs text-muted-foreground">{chapter.content?.trim() ? `${chapter.content.length} 字` : "正文待生成"}</p>
    {draft.restored || draft.isDirty ? <p role="status" className="text-sm text-muted-foreground">本机有未保存的正文修改，可点“小改正文”继续编辑。</p> : null}
    {draft.storageError ? <p role="alert" className="text-sm text-destructive">本机草稿保存失败，请保持页面打开并保存正文。</p> : null}
    {draft.hasExternalChange ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>已保存正文发生变化，请核对修改后载入新正文。</p><Button variant="outline" onClick={() => { if (window.confirm("载入新正文会替换本机未保存的修改，是否继续？")) draft.loadSavedVersion(); }}>载入已保存正文</Button></div> : null}
    {editing ? <>
      <textarea aria-label="章节正文" className="min-h-[60dvh] w-full rounded-md border bg-background p-3 text-base leading-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={draft.contentDraft} disabled={saving} onChange={event => draft.setContentDraft(event.target.value)} />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="sticky bottom-20 flex gap-3 bg-background py-3"><Button onClick={() => void save()} disabled={saving || !draft.isDirty || draft.hasExternalChange}>{saving ? "保存中…" : "保存正文"}</Button><Button variant="ghost" disabled={saving} onClick={() => setEditing(false)}>返回阅读</Button></div>
    </> : <><div className="whitespace-pre-wrap break-words text-base leading-8">{chapter.content || "AI 保存正文后可在这里阅读。"}</div><Button variant="outline" onClick={() => setEditing(true)}>小改正文</Button></>}
  </article>;
}
