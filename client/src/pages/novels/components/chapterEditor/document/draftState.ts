export interface ChapterDraft {
  content: string;
  savedContent: string;
  savedUpdatedAt: string;
}

function isNewerVersion(incoming: string, current: string): boolean {
  const incomingTime = Date.parse(incoming);
  const currentTime = Date.parse(current);
  if (Number.isFinite(incomingTime) && Number.isFinite(currentTime)) {
    return incomingTime > currentTime;
  }
  return incoming > current;
}

export function receiveChapter(draft: ChapterDraft, incoming: { content: string; updatedAt: string }, busy: boolean): ChapterDraft {
  if (!isNewerVersion(incoming.updatedAt, draft.savedUpdatedAt) || busy) return draft;
  // A refresh must not choose between an author's draft and an external edit.
  if (draft.content !== draft.savedContent) return draft;
  return { content: incoming.content, savedContent: incoming.content, savedUpdatedAt: incoming.updatedAt };
}

/** Advance the draft only if it still matches the local text captured when saving began. */
export function acknowledgeChapterSave(draft: ChapterDraft, expectedDraftContent: string, saved: { content: string; updatedAt: string }): ChapterDraft {
  return {
    content: draft.content === expectedDraftContent ? saved.content : draft.content,
    savedContent: saved.content,
    savedUpdatedAt: saved.updatedAt,
  };
}

export function restoreChapterDraft(raw: string | null, saved: ChapterDraft): ChapterDraft {
  try {
    const value = JSON.parse(raw ?? "null");
    return value?.version === 1 && typeof value.content === "string"
      && typeof value.savedContent === "string" && typeof value.savedUpdatedAt === "string"
      && value.content !== value.savedContent
      ? { content: value.content, savedContent: value.savedContent, savedUpdatedAt: value.savedUpdatedAt }
      : saved;
  } catch { return saved; }
}
