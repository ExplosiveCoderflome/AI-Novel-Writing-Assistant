export type ChapterTitleSurfaceFrame =
  | "of_phrase"
  | "colon_split"
  | "comma_split"
  | "question_hook"
  | "plain_statement";

const CHAPTER_TITLE_OF_PHRASE_PATTERN = /^[^，,：:？?的\s]{1,18}的[^，,：:？?的\s]{1,18}$/u;

function normalizeChapterTitle(title: string): string {
  return title
    .replace(/^["'“”‘’《》〈〉「」『』【】]+|["'“”‘’《》〈〉「」『』【】]+$/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/,/g, "，")
    .replace(/:/g, "：")
    .replace(/\?/g, "？");
}

export function detectChapterTitleSurfaceFrame(title: string): ChapterTitleSurfaceFrame {
  const normalized = normalizeChapterTitle(title);
  if (!normalized) {
    return "plain_statement";
  }
  if (normalized.includes("：")) {
    return "colon_split";
  }
  if (normalized.includes("，")) {
    return "comma_split";
  }
  if (normalized.includes("？")) {
    return "question_hook";
  }
  if (CHAPTER_TITLE_OF_PHRASE_PATTERN.test(normalized)) {
    return "of_phrase";
  }
  return "plain_statement";
}

function maximumOfPhraseCount(titleCount: number): number {
  return Math.max(1, Math.ceil(Math.max(titleCount, 1) * 0.3));
}

function maximumSingleFrameCount(titleCount: number): number {
  return Math.max(2, Math.ceil(Math.max(titleCount, 1) * 0.5));
}

function formatFrameLabel(frame: ChapterTitleSurfaceFrame): string {
  if (frame === "of_phrase") {
    return "“X的Y / X中的Y”";
  }
  if (frame === "comma_split") {
    return "“A，B / 四字动作，四字结果”";
  }
  if (frame === "colon_split") {
    return "“A：B”";
  }
  if (frame === "question_hook") {
    return "“问题钩子型”";
  }
  return "“平铺直述型”";
}

export function getChapterTitleDiversityIssue(titles: string[]): string | null {
  const normalizedTitles = titles.map(normalizeChapterTitle).filter(Boolean);
  if (normalizedTitles.length <= 1) {
    return null;
  }

  const seenTitles = new Set<string>();
  const ofPhraseExamples: string[] = [];
  const frameCounts = new Map<ChapterTitleSurfaceFrame, number>();
  const frameExamples = new Map<ChapterTitleSurfaceFrame, string[]>();
  let previousFrame: ChapterTitleSurfaceFrame | null = null;
  let currentFrameClusterCount = 0;
  let maxFrameClusterCount = 0;
  let dominantClusterFrame: ChapterTitleSurfaceFrame | null = null;

  for (const title of normalizedTitles) {
    if (seenTitles.has(title)) {
      return `章节标题出现重复：${title}。请确保每章标题唯一。`;
    }
    seenTitles.add(title);

    const frame = detectChapterTitleSurfaceFrame(title);
    frameCounts.set(frame, (frameCounts.get(frame) ?? 0) + 1);
    const examples = frameExamples.get(frame) ?? [];
    if (examples.length < 3) {
      examples.push(title);
      frameExamples.set(frame, examples);
    }

    if (frame === "of_phrase") {
      if (ofPhraseExamples.length < 3) {
        ofPhraseExamples.push(title);
      }
    }

    if (frame === previousFrame) {
      currentFrameClusterCount += 1;
    } else {
      currentFrameClusterCount = 1;
      previousFrame = frame;
    }
    if (currentFrameClusterCount > maxFrameClusterCount) {
      maxFrameClusterCount = currentFrameClusterCount;
      dominantClusterFrame = frame;
    }
  }

  const ofPhraseCount = frameCounts.get("of_phrase") ?? 0;
  const maxAllowedOfPhraseCount = maximumOfPhraseCount(normalizedTitles.length);
  if (ofPhraseCount > maxAllowedOfPhraseCount) {
    return [
      `章节标题结构过于集中：${ofPhraseCount}/${normalizedTitles.length} 个标题使用了“X的Y / X中的Y”式结构。`,
      ofPhraseExamples.length > 0 ? `重复骨架示例：${ofPhraseExamples.join("、")}。` : "",
      "请降低这类标题占比，改用动作推进型、冲突压迫型、异常发现型、结果兑现型等不同章名。",
    ].filter(Boolean).join("");
  }

  let dominantFrame: ChapterTitleSurfaceFrame = "plain_statement";
  let dominantFrameCount = 0;
  for (const [frame, count] of frameCounts.entries()) {
    if (count > dominantFrameCount) {
      dominantFrame = frame;
      dominantFrameCount = count;
    }
  }

  const maxAllowedSingleFrameCount = maximumSingleFrameCount(normalizedTitles.length);
  if (dominantFrame !== "plain_statement" && dominantFrameCount > maxAllowedSingleFrameCount) {
    const examples = frameExamples.get(dominantFrame) ?? [];
    return [
      `章节标题结构过于集中：${dominantFrameCount}/${normalizedTitles.length} 个标题都落在 ${formatFrameLabel(dominantFrame)} 骨架上。`,
      examples.length > 0 ? `重复骨架示例：${examples.join("、")}。` : "",
      "请把标题改得更分散，混用动作推进型、冲突压迫型、异常发现型、结果兑现型、决断转向型等不同句法。",
    ].filter(Boolean).join("");
  }

  if (maxFrameClusterCount > 3 && dominantClusterFrame && dominantClusterFrame !== "plain_statement") {
    return `相邻章节标题结构过于重复：连续 ${maxFrameClusterCount} 个标题都在使用 ${formatFrameLabel(dominantClusterFrame)} 骨架。请把相邻章名改成不同句法。`;
  }

  return null;
}

export function assertChapterTitleDiversity(titles: string[]): void {
  const issue = getChapterTitleDiversityIssue(titles);
  if (issue) {
    throw new Error(issue);
  }
}
