import type {
  ChapterEditorAiRevisionIntent,
  ChapterEditorContextWindow,
  ChapterEditorMacroContext,
  ChapterEditorOperation,
  ChapterEditorTargetRange,
  PacePreference,
  StoryPlan,
  StoryStateSnapshot,
  VolumePlan,
} from "@ai-novel/shared/types/novel";

type WorldLike = {
  name?: string | null;
  worldType?: string | null;
  description?: string | null;
  overviewSummary?: string | null;
  conflicts?: string | null;
  magicSystem?: string | null;
  axioms?: string | null;
} | null | undefined;

type BookContractLike = {
  readingPromise?: string | null;
  protagonistFantasy?: string | null;
  coreSellingPoint?: string | null;
  escalationLadder?: string | null;
  absoluteRedLines?: string[] | null;
} | null | undefined;

export interface ChapterEditorParagraph {
  index: number;
  text: string;
  from: number;
  to: number;
}

export interface ChapterEditorVolumeLocation {
  volume: VolumePlan | null;
  chapterIndex: number;
  chapterCount: number;
  volumePositionLabel: string;
  volumePhaseLabel: string;
}

export function normalizeEditorText(text: string | null | undefined): string {
  return (text ?? "").replace(/\r\n/g, "\n");
}

function normalizeParagraphText(text: string): string {
  return normalizeEditorText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeChapterContent(text: string | null | undefined): string {
  const paragraphs = normalizeEditorText(text)
    .split(/\n{2,}/)
    .map((paragraph) => normalizeParagraphText(paragraph))
    .filter(Boolean);
  return paragraphs.join("\n\n");
}

export function countEditorWords(text: string | null | undefined): number {
  return normalizeEditorText(text).replace(/\s+/g, "").length;
}

export function splitParagraphsWithRanges(text: string | null | undefined): ChapterEditorParagraph[] {
  const normalized = normalizeChapterContent(text);
  if (!normalized) {
    return [];
  }

  const paragraphs = normalized.split(/\n{2,}/);
  let cursor = 0;
  return paragraphs.map((paragraph, index) => {
    const from = cursor;
    const to = from + paragraph.length;
    cursor = to + 2;
    return {
      index: index + 1,
      text: paragraph,
      from,
      to,
    };
  });
}

export function buildParagraphWindow(
  content: string,
  range: ChapterEditorTargetRange,
): ChapterEditorContextWindow {
  const paragraphs = splitParagraphsWithRanges(content);
  if (paragraphs.length === 0) {
    return { beforeParagraphs: [], afterParagraphs: [] };
  }

  const startIndex = paragraphs.findIndex((paragraph) => range.from >= paragraph.from && range.from <= paragraph.to);
  const endIndex = paragraphs.findIndex((paragraph) => range.to >= paragraph.from && range.to <= paragraph.to);
  const resolvedStart = startIndex >= 0 ? startIndex : 0;
  const resolvedEnd = endIndex >= 0 ? endIndex : resolvedStart;

  return {
    beforeParagraphs: paragraphs.slice(Math.max(0, resolvedStart - 3), resolvedStart).map((paragraph) => paragraph.text),
    afterParagraphs: paragraphs.slice(resolvedEnd + 1, resolvedEnd + 3).map((paragraph) => paragraph.text),
  };
}

export function createTargetRangeForWholeChapter(content: string): ChapterEditorTargetRange {
  return {
    from: 0,
    to: content.length,
    text: content,
  };
}

export function buildAnchorRangeFromParagraphBounds(
  paragraphs: ChapterEditorParagraph[],
  paragraphStart?: number | null,
  paragraphEnd?: number | null,
): Pick<ChapterEditorTargetRange, "from" | "to"> | null {
  if (!paragraphStart || !paragraphEnd || paragraphs.length === 0) {
    return null;
  }
  const start = paragraphs.find((paragraph) => paragraph.index === paragraphStart);
  const end = paragraphs.find((paragraph) => paragraph.index === paragraphEnd);
  if (!start || !end) {
    return null;
  }
  return {
    from: Math.max(0, Math.min(start.from, end.from)),
    to: Math.max(start.to, end.to),
  };
}

export function parseLooseTextList(value: string | null | undefined): string[] {
  const source = value?.trim();
  if (!source) {
    return [];
  }
  try {
    const parsed = JSON.parse(source) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
    }
  } catch {
    // Fall back to plain-text split below.
  }
  return source
    .split(/[\n,，;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildStyleSummary(novel: {
  styleTone?: string | null;
  narrativePov?: string | null;
  pacePreference?: string | null;
  emotionIntensity?: string | null;
}): string {
  return [
    novel.styleTone?.trim(),
    novel.narrativePov ? `视角: ${novel.narrativePov}` : null,
    novel.pacePreference ? `节奏: ${novel.pacePreference}` : null,
    novel.emotionIntensity ? `情绪强度: ${novel.emotionIntensity}` : null,
  ].filter((item): item is string => Boolean(item && item.trim())).join(" · ");
}

export function buildWorldConstraintSummary(world: WorldLike): string {
  if (!world) {
    return "暂无额外世界约束。";
  }
  const lines = [
    world.name?.trim() ? `${world.name}${world.worldType?.trim() ? ` (${world.worldType.trim()})` : ""}` : null,
    world.overviewSummary?.trim() || world.description?.trim() || null,
    world.conflicts?.trim() ? `主要冲突：${world.conflicts.trim()}` : null,
    world.magicSystem?.trim() ? `力量/规则：${world.magicSystem.trim()}` : null,
  ].filter((item): item is string => Boolean(item));
  const axioms = parseLooseTextList(world.axioms).slice(0, 3);
  if (axioms.length > 0) {
    lines.push(`硬规则：${axioms.join("；")}`);
  }
  return lines.join("\n") || "暂无额外世界约束。";
}

export function buildCharacterStateSummary(snapshot?: StoryStateSnapshot | null): string {
  if (!snapshot || snapshot.characterStates.length === 0) {
    return "当前没有提取到角色状态。";
  }
  return snapshot.characterStates
    .slice(0, 5)
    .map((state) => {
      const parts = [
        state.summary?.trim(),
        state.currentGoal?.trim(),
        state.emotion?.trim(),
      ].filter(Boolean);
      return parts.length > 0 ? `- ${parts.join(" / ")}` : null;
    })
    .filter((item): item is string => Boolean(item))
    .join("\n") || "当前没有提取到角色状态。";
}

export function buildMustKeepConstraints(
  bookContract?: BookContractLike,
  chapterPlan?: StoryPlan | null,
): string[] {
  const mustPreserve = parseLooseTextList(chapterPlan?.mustPreserveJson);
  const redLines = (bookContract?.absoluteRedLines ?? []).filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return Array.from(new Set([
    ...mustPreserve,
    ...redLines,
    "保持当前叙事事实一致",
    "保持当前叙事视角和人称",
  ])).slice(0, 6);
}

export function findVolumeLocation(volumes: VolumePlan[], chapterOrder: number): ChapterEditorVolumeLocation {
  const volume = volumes.find((candidate) => candidate.chapters.some((chapter) => chapter.chapterOrder === chapterOrder)) ?? null;
  if (!volume) {
    return {
      volume: null,
      chapterIndex: -1,
      chapterCount: 0,
      volumePositionLabel: "未识别到卷内位置",
      volumePhaseLabel: "独立修文",
    };
  }

  const sortedChapters = volume.chapters.slice().sort((left, right) => left.chapterOrder - right.chapterOrder);
  const chapterIndex = sortedChapters.findIndex((chapter) => chapter.chapterOrder === chapterOrder);
  const chapterCount = sortedChapters.length;
  const ordinal = chapterIndex + 1;

  return {
    volume,
    chapterIndex,
    chapterCount,
    volumePositionLabel: `本卷第 ${ordinal} / ${chapterCount} 章`,
    volumePhaseLabel: resolveVolumePhaseLabel(chapterIndex, chapterCount),
  };
}

function resolveVolumePhaseLabel(chapterIndex: number, chapterCount: number): string {
  if (chapterCount <= 0 || chapterIndex < 0) {
    return "独立修文";
  }
  if (chapterCount === 1 || chapterIndex === 0) {
    return "开卷";
  }

  const ratio = chapterCount === 1 ? 1 : chapterIndex / (chapterCount - 1);
  if (ratio < 0.28) {
    return "前段推进";
  }
  if (ratio < 0.6) {
    return "中段承压";
  }
  if (ratio < 0.82) {
    return "高潮前";
  }
  if (chapterIndex >= chapterCount - 1) {
    return "收束过渡";
  }
  return "高潮兑现";
}

export function buildPaceDirective(
  volumePhaseLabel: string,
  preference?: PacePreference | null,
): string {
  const paceLabel = preference === "slow"
    ? "整体节奏偏慢"
    : preference === "fast"
      ? "整体节奏偏快"
      : "整体节奏保持均衡";
  const phaseDirective = ({
    开卷: "优先快速立住处境、矛盾与阅读抓手，不宜过早把篇幅耗在静态解释上。",
    前段推进: "要持续推进问题与目标，避免重复铺垫已经成立的信息。",
    中段承压: "应抬高压迫和代价，让人物被局势持续推着走。",
    高潮前: "要集中火力收束线索、抬高期待，为爆发做准备。",
    高潮兑现: "允许更强烈的冲突、情绪和结果兑现，但不能偏离主线任务。",
    收束过渡: "重点是兑现后果、完成转场，并稳稳把读者送向下一章或下一卷。",
  } as Record<string, string>)[volumePhaseLabel] ?? "优先维持当前章节任务与卷内承接。";
  return `${paceLabel}；${phaseDirective}`;
}

export function buildMacroContextSummary(context: ChapterEditorMacroContext): string {
  return [
    `章节在本卷中的角色：${context.chapterRoleInVolume}`,
    `卷标题：${context.volumeTitle}`,
    `卷内位置：${context.volumePositionLabel}`,
    `阶段定位：${context.volumePhaseLabel}`,
    `节奏建议：${context.paceDirective}`,
    `本章任务：${context.chapterMission}`,
    `承接上一章：${context.previousChapterBridge}`,
    `铺向下一章：${context.nextChapterBridge}`,
    `主线/伏笔：${context.activePlotThreads.join("；") || "暂无"}`,
    `角色状态：${context.characterStateSummary}`,
    `世界约束：${context.worldConstraintSummary}`,
    `必须守住：${context.mustKeepConstraints.join("；") || "保持现有事实与人称"}`,
  ].join("\n");
}

export function buildPresetIntent(
  operation: ChapterEditorOperation,
  mustKeepConstraints: string[],
  customInstruction?: string,
): ChapterEditorAiRevisionIntent {
  const preserved = Array.from(new Set([
    ...mustKeepConstraints,
    "保留当前剧情事实",
    "保留原段核心信息",
  ])).slice(0, 6);
  const shared = {
    mustPreserve: preserved,
    mustAvoid: ["不要改写出模板化 AI 腔", "不要破坏上下文承接"],
    strength: "medium" as const,
  };

  switch (operation) {
    case "expand":
      return {
        editGoal: "补足细节，让信息更可感知",
        toneShift: "保持原有语气",
        paceAdjustment: "略微放慢，换取更清晰的画面与动作",
        conflictAdjustment: "保持现有冲突强度",
        emotionAdjustment: "维持现有情绪基调",
        reasoningSummary: "这次改写重点是补细节和体验感，但不改变原段任务。",
        ...shared,
      };
    case "compress":
      return {
        editGoal: "压缩冗余，让推进更紧",
        toneShift: "保持原有语气",
        paceAdjustment: "明显提速，减少重复和静态描述",
        conflictAdjustment: "维持现有冲突走向",
        emotionAdjustment: "保留现有情绪信号，不额外拔高",
        reasoningSummary: "这次改写重点是去掉拖慢推进的内容，让读者更快进入下一步。",
        ...shared,
      };
    case "emotion":
      return {
        editGoal: "强化情绪传递",
        toneShift: "在不跳出原文风格的前提下更有情绪张力",
        paceAdjustment: "节奏保持稳健，不额外拉长动作链",
        conflictAdjustment: "允许情绪上的紧张感更明显",
        emotionAdjustment: "显著增强人物情绪与感受",
        reasoningSummary: "这次改写重点是让读者更直接感受到人物情绪，而不是只看到事件。",
        ...shared,
      };
    case "conflict":
      return {
        editGoal: "强化冲突与压迫",
        toneShift: "保持原有语气，但更有对抗感",
        paceAdjustment: "适度提速，让矛盾更快顶上来",
        conflictAdjustment: "显著增强冲突感与不适感",
        emotionAdjustment: "让情绪更贴着冲突走",
        reasoningSummary: "这次改写重点是把冲突推到更前面，让张力更早被读者感知。",
        ...shared,
      };
    case "custom":
      return {
        editGoal: customInstruction?.trim() || "按用户要求修正",
        toneShift: "按用户要求调整",
        paceAdjustment: "按用户要求调整",
        conflictAdjustment: "按用户要求调整",
        emotionAdjustment: "按用户要求调整",
        reasoningSummary: "这次改写直接执行用户的补充修正要求，同时守住章节事实和承接。",
        ...shared,
      };
    case "polish":
    default:
      return {
        editGoal: "优化表达，让文本更自然顺畅",
        toneShift: "保持原有语气",
        paceAdjustment: "节奏尽量保持稳定",
        conflictAdjustment: "维持现有冲突走向",
        emotionAdjustment: "保留原有情绪，但表达更准确",
        reasoningSummary: "这次改写重点是让句子更顺、更稳，不改变原段剧情职责。",
        ...shared,
      };
  }
}
