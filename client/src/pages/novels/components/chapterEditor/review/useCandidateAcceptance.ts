import { useMutation } from "@tanstack/react-query";
import type { ChapterEditorCandidate } from "@ai-novel/shared/types/novel";
import { applySelectedChapterEditorDiff, insertChapterContinuation, replaceChapterSelection } from "@ai-novel/shared/types/chapterEditor/document";
import { createNovelSnapshot, updateNovelChapter } from "@/api/novel";
import { toast } from "@/components/ui/toast";
import type { ChapterEditorSessionState } from "../chapterEditorTypes";

export function useCandidateAcceptance(input: {
  novelId: string;
  chapter?: { id: string; order: number };
  session: ChapterEditorSessionState;
  candidate: ChapterEditorCandidate | null;
  selectedChangeIds: ReadonlySet<string>;
  content: string;
  sourceSnapshot?: string;
  savedUpdatedAt: string;
  acknowledgeSave: (content: string, saved: { content?: string | null; updatedAt: string }) => void;
  onAccepted: () => Promise<void>;
}) {
  return useMutation({
    mutationFn: async () => {
      const { chapter, candidate, session, selectedChangeIds } = input;
      if (!chapter || !candidate || !session.targetRange || session.status !== "ready") {
        throw new Error("当前没有可应用的候选版本。");
      }
      if (selectedChangeIds.size === 0) throw new Error("请先选择要采纳的修改。");
      if (input.sourceSnapshot !== input.content) throw new Error("正文已变化，请重新生成修改建议。");
      const replacement = applySelectedChapterEditorDiff(session.targetRange.text, candidate.content, candidate.diffChunks, selectedChangeIds);
      const nextContent = session.mode === "continuation"
        ? insertChapterContinuation(input.content, session.targetRange.from, replacement)
        : replaceChapterSelection(input.content, session.targetRange, replacement);
      if (nextContent === input.content) throw new Error("所选修改与原文相同，无需再次保存。");
      await createNovelSnapshot(input.novelId, {
        triggerType: "manual", label: `chapter-editor:${chapter.order}:${session.scope}:${Date.now()}`,
      });
      const response = await updateNovelChapter(input.novelId, chapter.id, {
        content: nextContent, expectedUpdatedAt: input.savedUpdatedAt,
      });
      return { nextContent, saved: response.data };
    },
    onSuccess: async ({ nextContent, saved }) => {
      input.acknowledgeSave(nextContent, { content: saved?.content ?? nextContent, updatedAt: String(saved?.updatedAt ?? Date.now()) });
      await input.onAccepted();
      toast.success("所选修改已保存，修改前版本可在历史中查看。");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "应用候选版本失败。"),
  });
}
