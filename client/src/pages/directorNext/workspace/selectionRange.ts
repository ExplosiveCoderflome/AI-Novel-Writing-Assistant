import {
  HUMAN_STYLE_ISSUE_TAGS,
  type HumanStyleIssueTag,
} from "@ai-novel/shared/types/styleEngine";
import type { ChapterEditorRepairBrief } from "@ai-novel/shared/types/novel";

export interface ParagraphRange {
  index: number;
  from: number;
  to: number;
  text: string;
}

export interface SelectedProseRange {
  from: number;
  to: number;
  text: string;
}

/**
 * Splits chapter prose on blank-line boundaries while preserving exact character offsets
 * so selection rewrites splice safely against the saved chapter text.
 */
export function splitParagraphRanges(content: string): ParagraphRange[] {
  if (!content) {
    return [];
  }
  const ranges: ParagraphRange[] = [];
  const separator = /\n\s*\n/g;
  let cursor = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = separator.exec(content)) !== null) {
    const chunk = content.slice(cursor, match.index);
    if (chunk.length > 0 && chunk.trim().length > 0) {
      ranges.push({
        index: index++,
        from: cursor,
        to: match.index,
        text: chunk,
      });
    }
    cursor = match.index + match[0].length;
  }
  const tail = content.slice(cursor);
  if (tail.length > 0 && tail.trim().length > 0) {
    ranges.push({
      index: index++,
      from: cursor,
      to: content.length,
      text: tail,
    });
  }
  return ranges;
}

export function buildParagraphWindowFromRange(
  paragraphs: ParagraphRange[],
  from: number,
  to: number,
): { beforeParagraphs: string[]; afterParagraphs: string[] } {
  const firstIdx = paragraphs.findIndex((item) => item.to > from);
  if (firstIdx < 0) {
    return { beforeParagraphs: [], afterParagraphs: [] };
  }
  let lastIdx = firstIdx;
  for (let i = firstIdx; i < paragraphs.length; i++) {
    if (paragraphs[i].from < to) {
      lastIdx = i;
    } else {
      break;
    }
  }
  return {
    beforeParagraphs: paragraphs.slice(Math.max(0, firstIdx - 3), firstIdx).map((item) => item.text),
    afterParagraphs: paragraphs.slice(lastIdx + 1, lastIdx + 3).map((item) => item.text),
  };
}

function resolveDomOffsetInParagraph(paragraphElement: HTMLElement, container: Node, offset: number): number {
  const probe = document.createRange();
  probe.setStart(paragraphElement, 0);
  probe.setEnd(container, offset);
  return probe.toString().length;
}

function trimWhitespaceRange(content: string, rawFrom: number, rawTo: number): SelectedProseRange | null {
  let from = Math.max(0, Math.min(rawFrom, content.length));
  let to = Math.max(0, Math.min(rawTo, content.length));
  if (from > to) {
    [from, to] = [to, from];
  }
  while (from < to && /\s/.test(content[from])) {
    from++;
  }
  while (to > from && /\s/.test(content[to - 1])) {
    to--;
  }
  const text = content.slice(from, to);
  if (text.trim().length < 2) {
    return null;
  }
  return { from, to, text };
}

export function resolveSelectedProseRange(
  container: HTMLElement | null,
  content: string,
  paragraphs: ParagraphRange[],
  selection: Selection | null,
): SelectedProseRange | null {
  if (!container || !content || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
    return null;
  }

  const findParagraphElement = (node: Node): HTMLElement | null => {
    const element = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
    return element?.closest<HTMLElement>("[data-paragraph-index]") ?? null;
  };

  const startEl = findParagraphElement(range.startContainer);
  const endEl = findParagraphElement(range.endContainer);
  if (!startEl || !endEl) {
    return null;
  }

  const startParagraphIndex = Number(startEl.dataset.paragraphIndex);
  const endParagraphIndex = Number(endEl.dataset.paragraphIndex);
  const startParagraph = paragraphs.find((item) => item.index === startParagraphIndex);
  const endParagraph = paragraphs.find((item) => item.index === endParagraphIndex);
  if (!startParagraph || !endParagraph) {
    return null;
  }

  const startOffset = resolveDomOffsetInParagraph(startEl, range.startContainer, range.startOffset);
  const endOffset = resolveDomOffsetInParagraph(endEl, range.endContainer, range.endOffset);
  return trimWhitespaceRange(
    content,
    startParagraph.from + startOffset,
    endParagraph.from + endOffset,
  );
}

export function buildHumanFeedbackInstruction(
  issueTags: HumanStyleIssueTag[],
  feedbackNote: string,
): string {
  const labelMap = new Map(HUMAN_STYLE_ISSUE_TAGS.map((item) => [item.key, `${item.label}（${item.hint}）`]));
  const tagLines = issueTags
    .map((tag) => labelMap.get(tag))
    .filter((item): item is string => Boolean(item));
  const note = feedbackNote.trim();
  const parts: string[] = [];
  if (tagLines.length > 0) {
    parts.push(`作者标定问题：${tagLines.join("；")}`);
  }
  if (note) {
    parts.push(`作者补充意见：${note}`);
  }
  if (parts.length === 0) {
    parts.push("去掉 AI 模板感与书面套话，改用更自然贴合当前人物的表达。");
  } else {
    parts.push("在不改变剧情事实、人物关系与叙事视角的前提下，重写选中片段，使其读起来更自然具体、去 AI 味。");
  }
  return parts.join("\n");
}

export function buildHumanFeedbackRepairBrief(
  issueTags: HumanStyleIssueTag[],
  feedbackNote: string,
): ChapterEditorRepairBrief {
  const labelMap = new Map(HUMAN_STYLE_ISSUE_TAGS.map((item) => [item.key, item.label]));
  const labels = issueTags
    .map((tag) => labelMap.get(tag))
    .filter((item): item is string => Boolean(item));
  const note = feedbackNote.trim();
  const title = labels.length > 0 ? `作者标定：${labels.join(" / ")}` : "作者片段意见修订";
  const problemSummary = note || (labels.length > 0 ? `该片段存在：${labels.join("、")}` : "该片段需要更自然的书面表达");

  return {
    title,
    problemSummary,
    whyItMatters: "作者在阅读时直接指出了不适表达，局部改写需精准解决该问题并避免再次写成 AI 套话。",
    repairGoal: note || "去除生硬书面总结与模板化表达，用动作、对话和具体细节承接上下文。",
    repairApproach: labels.includes("padded_filler")
      ? "精简空转解释与重复心理描写，保留推动剧情或人物关系的动作。"
      : labels.includes("off_voice")
        ? "调整人物用词和反应方式，使对话与动作符合当前身份、处境与性格。"
        : "用具体动作、物件和贴合情境的细节代替抽象情绪总结。",
    mustPreserve: ["已发生的剧情事实与因果", "人物身份与当下叙事视角", "与前后段落的衔接关系"],
  };
}
