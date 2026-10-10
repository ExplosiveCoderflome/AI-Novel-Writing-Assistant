import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeChapterText } from "@ai-novel/shared/types/chapterEditor/document";
import { acknowledgeChapterSave, receiveChapter, restoreChapterDraft, type ChapterDraft } from "./draftState";

/** Mounted once per chapter. Tab-scoped drafts survive refresh and in-app navigation. */
export function useChapterDraft(input: {
  novelId: string;
  chapter: { id: string; content?: string | null; updatedAt: string } | undefined;
  busy: boolean;
}) {
  const storageKey = `ai-novel:chapter-draft:v1:${input.novelId}:${input.chapter?.id}`;
  const incoming = { content: normalizeChapterText(input.chapter?.content), updatedAt: input.chapter?.updatedAt ?? "" };
  const [restored, setRestored] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [draft, setDraft] = useState<ChapterDraft>(() => {
    const saved = { content: incoming.content, savedContent: incoming.content, savedUpdatedAt: incoming.updatedAt };
    try { return restoreChapterDraft(sessionStorage.getItem(storageKey), saved); } catch { return saved; }
  });
  const current = useRef(draft);
  const isDirty = draft.content !== draft.savedContent;
  const hasExternalChange = incoming.updatedAt > draft.savedUpdatedAt;

  const publish = useCallback((next: ChapterDraft) => {
    current.current = next;
    setDraft(next);
    try {
      if (next.content === next.savedContent) sessionStorage.removeItem(storageKey);
      else sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, ...next }));
      setStorageError(false);
    } catch { setStorageError(true); }
  }, [storageKey]);

  const identityRef = useRef(storageKey);
  useEffect(() => {
    if (identityRef.current === storageKey) return;
    identityRef.current = storageKey;
    const saved = { content: incoming.content, savedContent: incoming.content, savedUpdatedAt: incoming.updatedAt };
    try { publish(restoreChapterDraft(sessionStorage.getItem(storageKey), saved)); }
    catch { publish(saved); }
  }, [incoming.content, incoming.updatedAt, publish, storageKey]);

  useEffect(() => { setRestored(current.current.content !== current.current.savedContent); }, []);
  useEffect(() => {
    const next = receiveChapter(current.current, incoming, input.busy);
    if (next !== current.current) publish(next);
  }, [incoming.content, incoming.updatedAt, input.busy, publish]);
  useEffect(() => {
    if (!isDirty && !input.busy) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [isDirty, input.busy]);

  return {
    contentDraft: draft.content,
    savedContent: draft.savedContent,
    savedUpdatedAt: draft.savedUpdatedAt,
    isDirty, hasExternalChange, restored, storageError,
    setContentDraft: (content: string) => publish({ ...current.current, content }),
    acknowledgeSave: (submitted: string, saved: { content?: string | null; updatedAt: string }) => {
      publish(acknowledgeChapterSave(current.current, submitted, { content: normalizeChapterText(saved.content), updatedAt: saved.updatedAt }));
      setRestored(false);
    },
    loadSavedVersion: () => {
      publish({ content: incoming.content, savedContent: incoming.content, savedUpdatedAt: incoming.updatedAt });
      setRestored(false);
    },
  };
}
