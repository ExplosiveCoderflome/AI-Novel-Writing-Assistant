import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import {
  createChapterBoundarySchema,
  createChapterPurposeSchema,
  createChapterTaskSheetSchema,
} from "../../../../services/novel/volume/volumeGenerationSchemas";
import {
  buildBeatSheetContext,
  buildChapterDetailDraft,
  buildChapterNeighborContext,
  buildCommonNovelContext,
  buildCompactVolumeCard,
  buildCompactVolumeContext,
  buildStoryMacroContext,
  type VolumeChapterDetailPromptInput,
} from "./shared";

function createVolumeDetailSystemPrompt(detailMode: VolumeChapterDetailPromptInput["detailMode"]): string {
  if (detailMode === "purpose") {
    return [
      "你是资深网文编辑，负责对单章目标进行修正和收束。",
      "只输出严格 JSON，不要输出解释、Markdown 或额外文本。",
      "最终 JSON 只能包含字段：purpose。",
      "purpose 必须具体到这一章要推进什么，不要复述摘要。",
    ].join("\n");
  }
  if (detailMode === "boundary") {
    return [
      "你是资深网文编辑，负责为单章定义执行边界。",
      "只输出严格 JSON，不要输出解释、Markdown 或额外文本。",
      "最终 JSON 只能包含字段：conflictLevel、revealLevel、targetWordCount、mustAvoid、payoffRefs。",
      "各字段必须和当前卷节奏板一致，不要引入额外剧情。",
    ].join("\n");
  }
  return [
    "你是资深网文编辑，负责把单章任务单修正到可以直接交给正文生成。",
    "只输出严格 JSON，不要输出解释、Markdown 或额外文本。",
    "最终 JSON 只能包含字段：taskSheet。",
    "任务单必须覆盖情绪基调、冲突对象、关键推进和收尾要求。",
  ].join("\n");
}

function buildChapterDetailPrompt(input: VolumeChapterDetailPromptInput): string {
  return [
    `工作模式：章节细化（${input.detailMode}）`,
    buildCommonNovelContext(input.novel),
    `当前卷：${buildCompactVolumeCard(input.targetVolume)}`,
    `当前卷节奏板：${buildBeatSheetContext(input.targetBeatSheet)}`,
    `章节邻接上下文：${buildChapterNeighborContext(input.targetVolume, input.targetChapter.id)}`,
    buildChapterDetailDraft(input.targetChapter, input.detailMode),
    `全书卷骨架：${buildCompactVolumeContext(input.workspace.volumes)}`,
    buildStoryMacroContext(input.storyMacroPlan),
    input.guidance?.trim() ? `额外指令：${input.guidance.trim()}` : "",
  ].filter(Boolean).join("\n\n");
}

export const volumeChapterPurposePrompt: PromptAsset<
  VolumeChapterDetailPromptInput,
  ReturnType<typeof createChapterPurposeSchema>["_output"]
> = {
  id: "novel.volume.chapter_purpose",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: createChapterPurposeSchema(),
  render: (input) => [
    new SystemMessage(createVolumeDetailSystemPrompt("purpose")),
    new HumanMessage(buildChapterDetailPrompt(input)),
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
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: createChapterBoundarySchema(),
  render: (input) => [
    new SystemMessage(createVolumeDetailSystemPrompt("boundary")),
    new HumanMessage(buildChapterDetailPrompt(input)),
  ],
};

export const volumeChapterTaskSheetPrompt: PromptAsset<
  VolumeChapterDetailPromptInput,
  ReturnType<typeof createChapterTaskSheetSchema>["_output"]
> = {
  id: "novel.volume.chapter_task_sheet",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: createChapterTaskSheetSchema(),
  render: (input) => [
    new SystemMessage(createVolumeDetailSystemPrompt("task_sheet")),
    new HumanMessage(buildChapterDetailPrompt(input)),
  ],
};
