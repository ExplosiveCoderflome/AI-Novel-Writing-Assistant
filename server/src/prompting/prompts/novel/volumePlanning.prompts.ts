import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../core/promptTypes";
import {
  buildBookSkeletonPrompt,
  buildChapterDetailPrompt,
  buildVolumeChapterListPrompt,
  type ChapterDetailMode,
} from "../../../services/novel/volume/volumeGenerationPrompts";
import {
  createBookVolumeSkeletonSchema,
  createChapterBoundarySchema,
  createChapterPurposeSchema,
  createChapterTaskSheetSchema,
  createVolumeChapterListSchema,
} from "../../../services/novel/volume/volumeGenerationSchemas";

interface VolumeSkeletonPromptInput {
  novel: Parameters<typeof buildBookSkeletonPrompt>[0]["novel"];
  workspace: Parameters<typeof buildBookSkeletonPrompt>[0]["workspace"];
  storyMacroPlan: Parameters<typeof buildBookSkeletonPrompt>[0]["storyMacroPlan"];
  guidance?: string;
  chapterBudget: number;
  targetVolumeCount: number;
  chapterBudgets: number[];
}

interface VolumeChapterListPromptInput {
  novel: Parameters<typeof buildVolumeChapterListPrompt>[0]["novel"];
  workspace: Parameters<typeof buildVolumeChapterListPrompt>[0]["workspace"];
  targetVolume: Parameters<typeof buildVolumeChapterListPrompt>[0]["targetVolume"];
  previousVolume?: Parameters<typeof buildVolumeChapterListPrompt>[0]["previousVolume"];
  nextVolume?: Parameters<typeof buildVolumeChapterListPrompt>[0]["nextVolume"];
  storyMacroPlan: Parameters<typeof buildVolumeChapterListPrompt>[0]["storyMacroPlan"];
  guidance?: string;
  chapterBudget: number;
  targetChapterCount: number;
}

interface VolumeChapterDetailPromptInput {
  novel: Parameters<typeof buildChapterDetailPrompt>[0]["novel"];
  workspace: Parameters<typeof buildChapterDetailPrompt>[0]["workspace"];
  targetVolume: Parameters<typeof buildChapterDetailPrompt>[0]["targetVolume"];
  targetChapter: Parameters<typeof buildChapterDetailPrompt>[0]["targetChapter"];
  storyMacroPlan: Parameters<typeof buildChapterDetailPrompt>[0]["storyMacroPlan"];
  guidance?: string;
  detailMode: ChapterDetailMode;
}

function createVolumeDetailSystemPrompt(detailMode: ChapterDetailMode): string {
  if (detailMode === "purpose") {
    return [
      "你是资深网文编辑。",
      "请输出严格 JSON，只填写这一章修正后的章节目标。",
      "优先基于已有草稿做修正、补强和收束；如果当前为空，再补出首版。",
      "目标要聚焦剧情推进、人物关系或信息兑现，不要写成复述摘要。",
      "最终 JSON 只能使用字段名 purpose。",
      "正确示例：{\"purpose\":\"本章必须推进……\"}",
      "禁止使用中文键名。",
    ].join("\n");
  }

  if (detailMode === "boundary") {
    return [
      "你是资深网文编辑。",
      "请输出严格 JSON，只填写这一章修正后的执行边界。",
      "优先沿用已有边界草稿，修正空缺、模糊和不合理之处，不要无故推翻已经确定的方向。",
      "冲突等级和揭露等级用 0-100 的整数；目标字数要符合章节节奏；禁止事项要具体；兑现关联要写清本章该触碰的伏笔或承诺。",
      "最终 JSON 只能使用字段名 conflictLevel、revealLevel、targetWordCount、mustAvoid、payoffRefs。",
      "禁止使用中文键名。",
    ].join("\n");
  }

  return [
    "你是资深网文编辑。",
    "请输出严格 JSON，只填写这一章修正后的任务单。",
    "优先基于已有任务单做修正和补强；如果当前为空，再补出首版。",
    "任务单要能直接交给写作阶段执行，包含情绪、冲突、推进点和收尾要求。",
    "最终 JSON 只能使用字段名 taskSheet。",
    "正确示例：{\"taskSheet\":\"……\"}",
    "禁止使用中文键名。",
  ].join("\n");
}

export function createVolumeSkeletonPrompt(targetVolumeCount: number): PromptAsset<VolumeSkeletonPromptInput, ReturnType<typeof createBookVolumeSkeletonSchema>["_output"]> {
  return {
    id: "novel.volume.skeleton",
    version: "v1",
    taskType: "planner",
    mode: "structured",
    language: "zh",
    contextPolicy: {
      maxTokensBudget: 0,
    },
    outputSchema: createBookVolumeSkeletonSchema(targetVolumeCount),
    render: (input) => [
      new SystemMessage([
        "你是擅长长篇网文结构设计的总策划。",
        `必须严格输出 ${input.targetVolumeCount} 卷，不能增减卷数。`,
        "请输出严格 JSON，包含 volumes 数组。",
        "每卷必须给出：title、mainPromise、escalationMode、protagonistChange、climax、nextVolumeHook。",
        "禁止输出章节列表，这一步只做卷级骨架。",
      ].join("\n")),
      new HumanMessage(buildBookSkeletonPrompt(input)),
    ],
  };
}

export function createVolumeChapterListPrompt(targetChapterCount: number): PromptAsset<VolumeChapterListPromptInput, ReturnType<typeof createVolumeChapterListSchema>["_output"]> {
  return {
    id: "novel.volume.chapter_list",
    version: "v1",
    taskType: "planner",
    mode: "structured",
    language: "zh",
    contextPolicy: {
      maxTokensBudget: 0,
    },
    outputSchema: createVolumeChapterListSchema(targetChapterCount),
    render: (input) => [
      new SystemMessage([
        "你是擅长长篇网文章节拆分的章纲策划。",
        `只允许为第 ${input.targetVolume.sortOrder} 卷生成 ${input.targetChapterCount} 个章节。`,
        "请输出严格 JSON，包含 chapters 数组。",
        "每章只允许输出 title 和 summary。",
        "禁止输出章节目标、执行边界、任务单。",
      ].join("\n")),
      new HumanMessage(buildVolumeChapterListPrompt(input)),
    ],
  };
}

export const volumeChapterPurposePrompt: PromptAsset<VolumeChapterDetailPromptInput, ReturnType<typeof createChapterPurposeSchema>["_output"]> = {
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

export const volumeChapterBoundaryPrompt: PromptAsset<VolumeChapterDetailPromptInput, ReturnType<typeof createChapterBoundarySchema>["_output"]> = {
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

export const volumeChapterTaskSheetPrompt: PromptAsset<VolumeChapterDetailPromptInput, ReturnType<typeof createChapterTaskSheetSchema>["_output"]> = {
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
