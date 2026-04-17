import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../../core/renderContextBlocks";
import {
  createChapterBoundarySchema,
  createChapterPurposeSchema,
  createChapterTaskSheetSchema,
} from "../../../../services/novel/volume/volumeGenerationSchemas";
import { type VolumeChapterDetailPromptInput } from "./shared";
import { buildVolumeChapterDetailContextBlocks } from "./contextBlocks";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";

const TITLE_EVENT_ANCHOR_HINTS = [
  "激活",
  "入手",
  "兑现",
  "暴露",
  "发现",
  "转向",
  "升级",
  "查账",
  "接管",
  "请缨",
  "破局",
  "反压",
  "发难",
  "露白",
  "启动",
  "异响",
  "得手",
  "松动",
];

function normalizeComparableText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function cleanAnchorFragment(value: string): string {
  return value.replace(/[《》【】「」『』“”"'‘’]/g, "").trim();
}

function extractEventAnchorsFromTitle(title: string | null | undefined): string[] {
  const normalized = normalizeComparableText(title);
  if (!normalized) {
    return [];
  }
  const seen = new Set<string>();
  const fragments = normalized
    .split(/[，,。；;：:、|/\\\-\s（）()]+/g)
    .map((item) => cleanAnchorFragment(item))
    .filter((item) => item.length >= 4 && item.length <= 16)
    .filter((item) => TITLE_EVENT_ANCHOR_HINTS.some((hint) => item.includes(hint)));

  for (const fragment of fragments) {
    seen.add(fragment);
  }
  return [...seen];
}

function buildCurrentChapterContractText(input: VolumeChapterDetailPromptInput): string {
  const { targetChapter } = input;
  return normalizeComparableText([
    targetChapter.title,
    targetChapter.summary,
    targetChapter.purpose,
    targetChapter.exclusiveEvent,
    targetChapter.endingState,
    targetChapter.nextChapterEntryState,
    targetChapter.payoffRefs.join(" "),
  ].filter(Boolean).join("\n"));
}

function validateBoundaryContract(
  output: {
    exclusiveEvent: string;
    endingState: string;
    nextChapterEntryState: string;
    conflictLevel: number;
    revealLevel: number;
    targetWordCount: number;
    mustAvoid: string;
    payoffRefs: string[];
  },
  input: VolumeChapterDetailPromptInput,
): {
  exclusiveEvent: string;
  endingState: string;
  nextChapterEntryState: string;
  conflictLevel: number;
  revealLevel: number;
  targetWordCount: number;
  mustAvoid: string;
  payoffRefs: string[];
} {
  const sortedChapters = input.targetVolume.chapters
    .slice()
    .sort((left, right) => left.chapterOrder - right.chapterOrder);
  const targetIndex = sortedChapters.findIndex((chapter) => chapter.id === input.targetChapter.id);
  if (targetIndex < 0) {
    return output;
  }

  const previousChapter = targetIndex > 0 ? sortedChapters[targetIndex - 1] : null;
  const nextChapter = targetIndex < sortedChapters.length - 1 ? sortedChapters[targetIndex + 1] : null;
  const currentContractText = buildCurrentChapterContractText(input);

  if (
    previousChapter?.exclusiveEvent?.trim()
    && output.exclusiveEvent.includes(previousChapter.exclusiveEvent.trim())
    && !currentContractText.includes(previousChapter.exclusiveEvent.trim())
  ) {
    throw new Error(`当前章独占事件与上一章独占事件「${previousChapter.exclusiveEvent.trim()}」冲突。一次性节点不能跨章重复占用。`);
  }
  const leakedNextAnchor = nextChapter
    ? extractEventAnchorsFromTitle(nextChapter.title).find((anchor) => (
      output.exclusiveEvent.includes(anchor)
      || output.endingState.includes(anchor)
      || output.nextChapterEntryState.includes(anchor)
    ))
    : null;
  if (leakedNextAnchor && !currentContractText.includes(leakedNextAnchor)) {
    throw new Error(`当前章边界合同疑似提前占用了下一章标题中的一次性事件锚点「${leakedNextAnchor}」。`);
  }
  if (normalizeComparableText(output.endingState) === normalizeComparableText(output.nextChapterEntryState)) {
    throw new Error("endingState 与 nextChapterEntryState 不能完全相同。前者是本章结束态，后者是下章入口态，必须体现承接而不是机械重复。");
  }

  return output;
}

function buildTaskSheetSemanticText(output: {
  taskSheet: string;
  sceneCards: Array<{
    title: string;
    purpose: string;
    entryState: string;
    exitState: string;
    mustAdvance: string[];
    forbiddenExpansion: string[];
  }>;
}): string {
  return normalizeComparableText([
    output.taskSheet,
    ...output.sceneCards.flatMap((scene) => [
      scene.title,
      scene.purpose,
      scene.entryState,
      scene.exitState,
      scene.mustAdvance.join(" "),
      scene.forbiddenExpansion.join(" "),
    ]),
  ].join("\n"));
}

function validateAdjacentChapterBoundary(
  output: {
    taskSheet: string;
    sceneCards: Array<{
      title: string;
      purpose: string;
      entryState: string;
      exitState: string;
      mustAdvance: string[];
      forbiddenExpansion: string[];
    }>;
  },
  input: VolumeChapterDetailPromptInput,
): {
  taskSheet: string;
  sceneCards: Array<{
    key: string;
    title: string;
    purpose: string;
    mustAdvance: string[];
    mustPreserve: string[];
    entryState: string;
    exitState: string;
    forbiddenExpansion: string[];
    targetWordCount: number;
  }>;
} {
  const sortedChapters = input.targetVolume.chapters
    .slice()
    .sort((left, right) => left.chapterOrder - right.chapterOrder);
  const targetIndex = sortedChapters.findIndex((chapter) => chapter.id === input.targetChapter.id);
  if (targetIndex < 0) {
    return output as {
      taskSheet: string;
      sceneCards: Array<{
        key: string;
        title: string;
        purpose: string;
        mustAdvance: string[];
        mustPreserve: string[];
        entryState: string;
        exitState: string;
        forbiddenExpansion: string[];
        targetWordCount: number;
      }>;
    };
  }

  const currentContractText = buildCurrentChapterContractText(input);
  const outputText = buildTaskSheetSemanticText(output);
  const adjacentChapters = [
    { label: "上一章", chapter: targetIndex > 0 ? sortedChapters[targetIndex - 1] : null },
    { label: "下一章", chapter: targetIndex < sortedChapters.length - 1 ? sortedChapters[targetIndex + 1] : null },
  ];

  for (const adjacent of adjacentChapters) {
    const chapter = adjacent.chapter;
    if (!chapter) {
      continue;
    }
    const leakedAnchor = extractEventAnchorsFromTitle(chapter.title)
      .find((anchor) => outputText.includes(anchor) && !currentContractText.includes(anchor));
    if (leakedAnchor) {
      throw new Error(
        `${adjacent.label}标题中的一次性事件锚点「${leakedAnchor}」疑似越界进入当前章节执行合同。当前章只能承接相邻章节状态，不能提前、滞后或重复承担相邻章节的关键首次事件。`,
      );
    }
  }

  return output as {
    taskSheet: string;
    sceneCards: Array<{
      key: string;
      title: string;
      purpose: string;
      mustAdvance: string[];
      mustPreserve: string[];
      entryState: string;
      exitState: string;
      forbiddenExpansion: string[];
      targetWordCount: number;
    }>;
  };
}

function createVolumeDetailSystemPrompt(detailMode: VolumeChapterDetailPromptInput["detailMode"]): string {
  if (detailMode === "purpose") {
    return [
      "你是资深网文章节编辑。",
      "当前任务是收束单章 purpose。",
      "只输出严格 JSON，且只包含 purpose 字段。",
      "purpose 必须说明这一章要推进什么，不要复述摘要。",
    ].join("\n");
  }
  if (detailMode === "boundary") {
    return [
      "你是资深网文章节编辑。",
      "当前任务是为单章定义执行边界。",
      "只输出严格 JSON，且只包含 exclusiveEvent、endingState、nextChapterEntryState、conflictLevel、revealLevel、targetWordCount、mustAvoid、payoffRefs。",
      "exclusiveEvent 表示只能由本章承担的一次性里程碑事件，必须具体，不能写成空泛主题。",
      "endingState 表示本章写完时的稳定局面。",
      "nextChapterEntryState 表示下一章开场时应承接的入口状态，必须与 endingState 强关联但不能逐字重复。",
      "边界合同必须保证：上一章已完成的独占事件不重复，本章独占事件不偷跑到下一章，下一章只承接状态不重演本章里程碑。",
      "各字段必须与当前卷节奏和相邻章节保持一致。",
    ].join("\n");
  }
  return [
    "你是资深网文章节编辑。",
    "当前任务是生成可直接交给正文生成器的章节执行合同。",
    "只输出严格 JSON，且只包含 taskSheet、sceneCards 两个字段。",
    "taskSheet 是给用户读的简洁执行摘要，需要覆盖情绪基调、冲突对象、关键推进和收尾要求。",
    "sceneCards 必须是 3-8 个场景卡数组，每个场景卡都必须包含 key、title、purpose、mustAdvance、mustPreserve、entryState、exitState、forbiddenExpansion、targetWordCount。",
    "sceneCards 必须完整覆盖整章推进和结尾 hook，不要把整章压成一个场景。",
    "当前章节的 title、summary、purpose、exclusiveEvent、endingState、nextChapterEntryState、conflictLevel、revealLevel、mustAvoid、payoffRefs 共同组成了本章硬边界合同。taskSheet 和 sceneCards 只能执行当前章合同，不能改写或覆盖它。",
    "你必须把 chapter_neighbors 视为相邻章边界提示：上一章已经完成的关键首次事件不能在本章重写一次，下一章标题或摘要中的关键首次事件也不能提前写进本章。",
    "本章结尾只能把局面推到下一章入口，不能直接落完下一章标题所承诺的核心里程碑。",
    "如果相邻章标题已经明确标出一次性节点，例如系统激活、第一笔资源入手、身份暴露、关键查账、正式请缨等，本章不得重复承担该节点，除非当前章自己的合同已经明确要求。",
    "你必须优先识别最近章节执行合同与当前章节之间的叙事重复风险，重点检查开场方式、推进方式、状态变化和结尾钩子是否连续复用。",
    "如果最近章节已经连续使用同类开场或同类推进，本章必须主动切换，不得继续沿用同一路数。",
    "差异化要求必须落实到 taskSheet 和 sceneCards 里，而不是停留在抽象提醒。",
    "首个 sceneCard 必须通过 purpose、entryState 或 forbiddenExpansion 明确避开最近章节的重复开场。",
    "至少一个中段 sceneCard 的 mustAdvance 必须明确要求不同于最近章节的推进结果，例如主动试探、关系建立、资源获得、规则认知或计划转向。",
    "如果最近章节已经连续写成外部压迫或被动逃离，本章不得继续只靠同类压迫推进，必须给出新的推进机制。",
  ].join("\n");
}

function buildChapterDetailPrompt(contextText: string, detailMode: VolumeChapterDetailPromptInput["detailMode"]): string {
  return [
    `detail mode: ${detailMode}`,
    "",
    "chapter detail context:",
    contextText,
  ].join("\n");
}

const baseContextPolicy = {
  maxTokensBudget: NOVEL_PROMPT_BUDGETS.volumeChapterDetail,
  requiredGroups: ["book_contract", "target_volume", "chapter_neighbors", "chapter_detail_draft"],
  preferredGroups: ["recent_execution_contracts", "macro_constraints", "target_beat_sheet", "volume_window"],
  dropOrder: ["volume_window"],
};

export const volumeChapterPurposePrompt: PromptAsset<
  VolumeChapterDetailPromptInput,
  ReturnType<typeof createChapterPurposeSchema>["_output"]
> = {
  id: "novel.volume.chapter_purpose",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: baseContextPolicy,
  outputSchema: createChapterPurposeSchema(),
  render: (input, context) => [
    new SystemMessage(createVolumeDetailSystemPrompt("purpose")),
    new HumanMessage(buildChapterDetailPrompt(renderSelectedContextBlocks(context), input.detailMode)),
  ],
};

export const volumeChapterBoundaryPrompt: PromptAsset<
  VolumeChapterDetailPromptInput,
  ReturnType<typeof createChapterBoundarySchema>["_output"]
> = {
  id: "novel.volume.chapter_boundary",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: baseContextPolicy,
  semanticRetryPolicy: {
    maxAttempts: 2,
  },
  outputSchema: createChapterBoundarySchema(),
  render: (input, context) => [
    new SystemMessage(createVolumeDetailSystemPrompt("boundary")),
    new HumanMessage(buildChapterDetailPrompt(renderSelectedContextBlocks(context), input.detailMode)),
  ],
  postValidate: (output, input) => validateBoundaryContract(output, input),
};

export const volumeChapterTaskSheetPrompt: PromptAsset<
  VolumeChapterDetailPromptInput,
  ReturnType<typeof createChapterTaskSheetSchema>["_output"]
> = {
  id: "novel.volume.chapter_task_sheet",
  version: "v2",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: baseContextPolicy,
  semanticRetryPolicy: {
    maxAttempts: 2,
  },
  outputSchema: createChapterTaskSheetSchema(),
  render: (input, context) => [
    new SystemMessage(createVolumeDetailSystemPrompt("task_sheet")),
    new HumanMessage(buildChapterDetailPrompt(renderSelectedContextBlocks(context), input.detailMode)),
  ],
  postValidate: (output, input) => validateAdjacentChapterBoundary(output, input),
};

export { buildVolumeChapterDetailContextBlocks };
