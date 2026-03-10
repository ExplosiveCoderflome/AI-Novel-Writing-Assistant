import type { Chapter, ReviewIssue } from "@ai-novel/shared/types/novel";

export interface ChapterExecutionStrategy {
  runMode: "fast" | "polish";
  wordSize: "short" | "medium" | "long";
  conflictLevel: number;
  pace: "slow" | "balanced" | "fast";
  aiFreedom: "low" | "medium" | "high";
}

function sanitize(input: string | null | undefined): string {
  return (input ?? "").trim();
}

export function resolveTargetWordCount(strategy: ChapterExecutionStrategy): number {
  if (strategy.wordSize === "short") {
    return 1500;
  }
  if (strategy.wordSize === "long") {
    return 3500;
  }
  return 2500;
}

export function buildChapterTaskSheet(chapter: Chapter, strategy: ChapterExecutionStrategy): string {
  const lines: string[] = [];
  lines.push(`执行模式：${strategy.runMode === "polish" ? "精修" : "快速"}`);
  lines.push(`目标字数：${resolveTargetWordCount(strategy)} 字`);
  lines.push(`冲突等级：${strategy.conflictLevel}`);
  lines.push(`节奏：${strategy.pace}`);
  lines.push(`AI自由度：${strategy.aiFreedom}`);
  if (sanitize(chapter.expectation)) {
    lines.push(`章节目标：${sanitize(chapter.expectation)}`);
  } else if (sanitize(chapter.title)) {
    lines.push(`章节目标：围绕「${sanitize(chapter.title)}」推进核心矛盾。`);
  }
  if (sanitize(chapter.mustAvoid)) {
    lines.push(`禁止事项：${sanitize(chapter.mustAvoid)}`);
  }
  return lines.join("\n");
}

export function buildSceneCardsFromChapter(chapter: Chapter): string {
  const expectation = sanitize(chapter.expectation);
  const content = sanitize(chapter.content);
  if (content) {
    const snippets = content
      .split(/[\n。！？]/g)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 6);
    const chunks = [snippets.slice(0, 2), snippets.slice(2, 4), snippets.slice(4, 6)].filter((part) => part.length > 0);
    return chunks
      .map((part, index) => `场景${index + 1}\n目标：推进章节冲突\n事件：${part.join("；")}`)
      .join("\n\n");
  }
  return [
    "场景1",
    `目标：建立本章起始局面${expectation ? `（${expectation.slice(0, 30)}）` : ""}`,
    "事件：角色进入冲突前置状态",
    "",
    "场景2",
    "目标：升级冲突与信息揭露",
    "事件：关键对抗与选择出现",
    "",
    "场景3",
    "目标：收束并抛出下一章钩子",
    "事件：结果落地与新风险浮现",
  ].join("\n");
}

export function buildRepairIssue(category: ReviewIssue["category"], fixSuggestion: string, evidence: string): ReviewIssue {
  return {
    severity: "medium",
    category,
    evidence,
    fixSuggestion,
  };
}
