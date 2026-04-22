import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import { buildWriterStyleContractText } from "../../styleEngine/styleContractText";

function compactText(value: string | null | undefined, limit: number): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

export function buildPreviousChaptersSummary(
  requestSummary: string[] | undefined,
  summaries: Array<{ chapter: { order: number; title: string }; summary: string }>,
): string[] {
  if (requestSummary?.length) {
    return requestSummary;
  }
  return summaries.map((item) => `第${item.chapter.order}章《${item.chapter.title}》 ${item.summary}`);
}

export function buildSupportingContextText(input: {
  worldBlock: string;
  storyModeBlock: string;
  planPromptBlock: string;
  stateContextBlock: string;
  openConflictBlock: string;
  decisionsBlock: string;
  summaryText: string;
  recentChapterContentText: string;
  factText: string;
  ragText: string;
  bibleText: string;
  outlineText: string;
  charactersContextText: string;
  styleBlock: string;
  styleEngineBlock: string;
}): string {
  return [
    input.worldBlock,
    input.storyModeBlock,
    input.planPromptBlock,
    input.stateContextBlock,
    input.openConflictBlock,
    input.decisionsBlock,
    input.summaryText,
    input.recentChapterContentText,
    input.factText,
    input.ragText ? `语义检索补充：\n${input.ragText}` : "",
    input.bibleText,
    input.outlineText,
    input.charactersContextText,
    input.styleBlock,
    input.styleEngineBlock,
  ].filter(Boolean).join("\n\n");
}

export function buildSummaryText(previousChaptersSummary: string[]): string {
  if (previousChaptersSummary.length === 0) {
    return "最近章节摘要：暂无";
  }
  return `最近章节摘要：\n${previousChaptersSummary.slice(0, 3).join("\n")}`;
}

export function buildFactText(facts: Array<{ category: string; content: string }>): string {
  if (facts.length === 0) {
    return "";
  }
  return `延续事实：\n${facts.slice(0, 6).map((item) => `[${item.category}] ${compactText(item.content, 90)}`).join("\n")}`;
}

export function buildRecentChapterContentText(
  recentChapters: Array<{ order: number; title: string; content: string | null }>,
): string {
  if (recentChapters.length === 0) {
    return "";
  }
  return `最近正文回捞（仅作局部延续参考）：\n${recentChapters
    .map((item) => {
      const digest = compactText(item.content, 180);
      return digest ? `${item.order}章《${item.title}》：${digest}` : "";
    })
    .filter(Boolean)
    .join("\n")}`;
}

export function buildCharactersContextText(
  characters: Array<{ name: string; role: string; personality: string | null }>,
): string {
  if (characters.length === 0) {
    return "";
  }
  return `角色底表：\n${characters
    .map((item) => `- ${item.name}(${item.role})${item.personality ? ` ${compactText(item.personality, 80)}` : ""}`)
    .join("\n")}`;
}

export function buildBibleText(bible: {
  mainPromise: string | null;
  coreSetting: string | null;
  forbiddenRules: string | null;
  characterArcs: string | null;
  worldRules: string | null;
} | null): string {
  if (!bible) {
    return "";
  }
  return [
    "作品圣经：",
    bible.mainPromise ? `主线承诺：${compactText(bible.mainPromise, 140)}` : "",
    bible.coreSetting ? `核心设定：${compactText(bible.coreSetting, 140)}` : "",
    bible.forbiddenRules ? `禁止冲突：${compactText(bible.forbiddenRules, 140)}` : "",
    bible.characterArcs ? `角色成长：${compactText(bible.characterArcs, 140)}` : "",
    bible.worldRules ? `世界规则：${compactText(bible.worldRules, 140)}` : "",
  ].filter(Boolean).join("\n");
}

export function buildOutlineText(outline: string | null | undefined): string {
  const text = compactText(outline, 500);
  return text ? `发展走向：\n${text}` : "";
}

export function buildStyleBlock(styleReference: string): string {
  const trimmed = styleReference.trim();
  return trimmed ? `文风参考（来自拆书分析）：\n${trimmed}` : "";
}

export function buildDecisionsBlock(
  decisions: Array<{ category: string; importance: string; content: string }>,
): string {
  if (decisions.length === 0) {
    return "";
  }
  return `创作决策（必须继承）：\n${decisions
    .slice(0, 8)
    .map((item) => `[${item.category}${item.importance === "critical" ? " 重要" : ""}] ${compactText(item.content, 120)}`)
    .join("\n")}`;
}

export function buildStyleEngineBlock(styleContext: GenerationContextPackage["styleContext"]): string {
  const contract = styleContext?.compiledBlocks?.contract;
  if (!contract) {
    return "";
  }
  return [
    "写法引擎约束：",
    buildWriterStyleContractText(contract),
  ].filter(Boolean).join("\n\n");
}

export function buildOpenConflictBlock(
  openConflicts: GenerationContextPackage["openConflicts"],
): string {
  if (openConflicts.length === 0) {
    return "";
  }
  return `活跃冲突 / 未解决问题：\n${openConflicts
    .slice(0, 6)
    .map((item) => {
      const suffix = typeof item.lastSeenChapterOrder === "number"
        ? ` | 最近出现于第${item.lastSeenChapterOrder}章`
        : "";
      const hint = item.resolutionHint ? ` | 建议：${compactText(item.resolutionHint, 80)}` : "";
      return `- [${item.severity}/${item.conflictType}] ${item.title}：${compactText(item.summary, 120)}${suffix}${hint}`;
    })
    .join("\n")}`;
}

export function parseJsonStringArraySafe(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}
