import type { PlannerInput, StructuredIntent } from "../types";
import {
  extractChapterId,
  extractContent,
  extractExplicitChapterOrders,
  extractFirstNChapters,
  extractRange,
  extractSingleChapterOrder,
} from "./utils";

export function inferFallbackIntent(input: PlannerInput): StructuredIntent {
  const goal = input.goal.trim();
  const chapterId = extractChapterId(goal);
  const range = extractRange(goal);
  const orders = extractExplicitChapterOrders(goal);
  const firstN = extractFirstNChapters(goal);
  const singleOrder = extractSingleChapterOrder(goal);
  const content = extractContent(goal) ?? undefined;

  if (/(这本书|该书|本小说|书名|标题).{0,8}(叫什么|名字|书名|标题)|^(书名|标题)$/.test(goal)) {
    return {
      goal,
      intent: "query_novel_title",
      confidence: 0.35,
      requiresNovelContext: true,
      chapterSelectors: {},
    };
  }

  if (/章/.test(goal) && /(几章|多少章|进度|写到第几章|完成到)/.test(goal)) {
    return {
      goal,
      intent: "query_progress",
      confidence: 0.35,
      requiresNovelContext: true,
      chapterSelectors: {},
    };
  }

  if (/章/.test(goal) && /(写了什么|写了啥|讲了什么|内容|剧情|梗概|概要|总结|回顾)/.test(goal)) {
    return {
      goal,
      intent: "query_chapter_content",
      confidence: 0.35,
      requiresNovelContext: true,
      chapterSelectors: {
        chapterId: chapterId ?? undefined,
        orders: orders.length > 0 ? orders : singleOrder != null ? [singleOrder] : undefined,
        range: range ?? undefined,
        relative: firstN != null ? { type: "first_n", count: firstN } : undefined,
      },
    };
  }

  if (/章/.test(goal) && /(写|书写|生成|创作|补全|续写)/.test(goal)) {
    return {
      goal,
      intent: "write_chapter",
      confidence: 0.35,
      requiresNovelContext: true,
      chapterSelectors: {
        chapterId: chapterId ?? undefined,
        orders: orders.length > 0 ? orders : singleOrder != null ? [singleOrder] : undefined,
        range: range ?? undefined,
      },
    };
  }

  if (/草稿/.test(goal) && content && (chapterId || singleOrder)) {
    return {
      goal,
      intent: "save_chapter_draft",
      confidence: 0.35,
      requiresNovelContext: true,
      chapterSelectors: {
        chapterId: chapterId ?? undefined,
        orders: singleOrder != null ? [singleOrder] : undefined,
      },
      content,
    };
  }

  return {
    goal,
    intent: "unknown",
    confidence: 0.2,
    requiresNovelContext: input.contextMode === "novel",
    chapterSelectors: {},
  };
}
