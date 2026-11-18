import {
  hasChapterQualityLoopReplanRequiredRiskFlags,
  readChapterQualityDebtDetails,
} from "@ai-novel/shared/types/chapterQualityLoop";
import type { NovelBookCompletion } from "@ai-novel/shared/types/director/bookProgress";

interface DeliveryChapter {
  id: string;
  order: number;
  content: string | null;
  chapterStatus: string | null;
  generationState: string | null;
  riskFlags: string | null;
}

export function projectBookCompletion(input: {
  target: number | null;
  chapters: readonly DeliveryChapter[];
  activity: "writing" | "needs_attention" | null;
}): NovelBookCompletion | null {
  if (!input.target || input.target < 1) return null;

  // The TXT export includes every chapter in this directory, including additions beyond the original target.
  const targetChapters = Math.max(input.target, input.chapters.length);
  const closedOrders = new Set<number>();
  let needsAttention = input.activity === "needs_attention";
  for (const chapter of input.chapters) {
    if (hasChapterQualityLoopReplanRequiredRiskFlags(chapter.riskFlags)) {
      needsAttention = true;
      continue;
    }
    if (chapter.order < 1 || chapter.order > targetChapters || !chapter.content?.trim()) continue;
    if (chapter.chapterStatus === "completed" || chapter.generationState === "approved"
      || chapter.generationState === "published" || readChapterQualityDebtDetails(chapter.riskFlags)) {
      closedOrders.add(chapter.order);
    }
  }

  const completedChapters = closedOrders.size;
  const status = needsAttention ? "needs_attention"
    : input.activity === "writing" || completedChapters !== targetChapters ? "writing" : "completed";
  return { status, completedChapters, targetChapters,
    firstChapterId: status === "completed" ? input.chapters.find(chapter => chapter.order === 1)?.id ?? null : null };
}

export function readBookCompletionActivity(status: string | null | undefined, pendingManualRecovery = false) {
  if (pendingManualRecovery || status === "waiting_approval" || status === "waiting_gate"
    || status === "paused" || status === "failed") return "needs_attention";
  return status === "running" || status === "queued" ? "writing" : null;
}
