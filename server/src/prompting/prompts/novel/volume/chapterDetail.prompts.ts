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
      "只输出严格 JSON，且只包含 conflictLevel、revealLevel、targetWordCount、mustAvoid、payoffRefs。",
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
  outputSchema: createChapterBoundarySchema(),
  render: (input, context) => [
    new SystemMessage(createVolumeDetailSystemPrompt("boundary")),
    new HumanMessage(buildChapterDetailPrompt(renderSelectedContextBlocks(context), input.detailMode)),
  ],
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
  outputSchema: createChapterTaskSheetSchema(),
  render: (input, context) => [
    new SystemMessage(createVolumeDetailSystemPrompt("task_sheet")),
    new HumanMessage(buildChapterDetailPrompt(renderSelectedContextBlocks(context), input.detailMode)),
  ],
};

export { buildVolumeChapterDetailContextBlocks };
