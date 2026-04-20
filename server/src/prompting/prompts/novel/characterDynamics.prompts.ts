import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import {
  chapterDynamicExtractionSchema,
  volumeDynamicsProjectionSchema,
} from "../../../services/novel/dynamics/characterDynamicsSchemas";

const VOLUME_DYNAMICS_PROJECTION_TEMPLATE = `{
  "assignments": [
    {
      "characterName": "string",
      "volumeSortOrder": 1,
      "roleLabel": "string or null",
      "responsibility": "string",
      "plannedChapterOrders": [1, 2],
      "isCore": true,
      "absenceWarningThreshold": 3,
      "absenceHighRiskThreshold": 5
    }
  ],
  "factionTracks": [
    {
      "characterName": "string",
      "volumeSortOrder": 1,
      "factionLabel": "string",
      "stanceLabel": "string or null",
      "summary": "string or null"
    }
  ],
  "relationStages": [
    {
      "sourceCharacterName": "string",
      "targetCharacterName": "string",
      "volumeSortOrder": 1,
      "stageLabel": "string",
      "stageSummary": "string"
    }
  ]
}`;

export interface VolumeDynamicsProjectionPromptInput {
  novelTitle: string;
  description: string;
  targetAudience: string;
  sellingPoint: string;
  firstPromise: string;
  outline: string;
  structuredOutline: string;
  appliedCastOption: string;
  rosterText: string;
  relationText: string;
  volumePlansText: string;
}

export interface ChapterDynamicsExtractionPromptInput {
  novelTitle: string;
  targetAudience: string;
  sellingPoint: string;
  firstPromise: string;
  currentVolumeTitle: string;
  rosterText: string;
  relationText: string;
  chapterOrder: number;
  chapterTitle: string;
  chapterContent: string;
}

export const volumeDynamicsProjectionPrompt: PromptAsset<
  VolumeDynamicsProjectionPromptInput,
  z.infer<typeof volumeDynamicsProjectionSchema>
> = {
  id: "novel.characterDynamics.volumeProjection",
  version: "v3",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: volumeDynamicsProjectionSchema,
  render: (input) => [
    new SystemMessage([
      "你是长篇中文网文的角色动态规划器。",
      "你的任务是基于小说定位、卖点、前 30 章承诺、角色名单、关系结构和分卷规划，生成可执行的“分卷角色动态投射”。",
      "",
      "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或任何额外文本。",
      "顶层只能包含 assignments、factionTracks、relationStages。",
      "",
      "全局硬规则：",
      "1. 只能使用已知 roster 中存在的角色名称，禁止新增角色、改名或使用模糊代称。",
      "2. 所有安排都必须基于输入材料，不得虚构超出材料支持的新设定、新关系或新身份。",
      "3. 材料不足时必须做保守推断，优先给低风险、能成立的安排，不要为了凑完整度硬补复杂动态。",
      "4. 结果必须服务卷级推进，而不是写成人物卡或静态档案。",
      "",
      "阈值硬规则：",
      "1. absenceWarningThreshold 和 absenceHighRiskThreshold 必须是 1-12 的整数。",
      "2. 即使角色在卷末才集中出场，阈值也不得超过 12。",
      "3. absenceHighRiskThreshold 不得小于 absenceWarningThreshold。",
      "4. 常规情况下优先使用 3 / 5；只有在叙事理由充分时才允许偏离。",
      "",
      "规划原则：",
      "1. 核心角色不是平均分配，而是按该卷任务、卖点兑现和叙事功能分配。",
      "2. 同一角色跨卷可升温、降温、转位、退场或重新激活，但变化必须有逻辑。",
      "3. 若某卷承担转折、升级、爆点或收束功能，角色配置必须同步反映这一点。",
      "4. plannedChapterOrders 只在角色需要稀疏、锚点式出场时填写；高频持续出场时可省略。",
      "",
      "压缩输出规则：",
      "1. 只保留系统后续确实需要消费的最小结果，不要输出总述。",
      "2. factionTracks 和 relationStages 只保留会影响写作决策的记录。",
      "3. 不要输出 confidence。",
      "",
      "固定 JSON 结构如下：",
      VOLUME_DYNAMICS_PROJECTION_TEMPLATE,
      "",
      "输出内容必须严格符合 volumeDynamicsProjectionSchema。",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      `小说简介：${input.description}`,
      `目标读者：${input.targetAudience}`,
      `核心卖点：${input.sellingPoint}`,
      `前30章承诺：${input.firstPromise}`,
      `大纲：${input.outline}`,
      `结构化大纲：${input.structuredOutline}`,
      `已应用角色方案：${input.appliedCastOption}`,
      `已知角色名单：\n${input.rosterText}`,
      `已知结构化关系：\n${input.relationText}`,
      `分卷规划：\n${input.volumePlansText}`,
      "",
      "输出提醒：阈值只能是 1-12 整数，且 highRiskThreshold 不能小于 warningThreshold。",
    ].join("\n\n")),
  ],
};

export const chapterDynamicsExtractionPrompt: PromptAsset<
  ChapterDynamicsExtractionPromptInput,
  z.infer<typeof chapterDynamicExtractionSchema>
> = {
  id: "novel.characterDynamics.chapterExtract",
  version: "v1",
  taskType: "fact_extraction",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: chapterDynamicExtractionSchema,
  render: (input) => [
    new SystemMessage([
      "你是长篇网文的角色动态信息提取器。",
      "你的任务是从给定章节里提取“会实际影响角色系统后续更新的事实级变化”。",
      "",
      "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或任何额外文本。",
      "",
      "抽取目标：",
      "1. 识别本章中影响角色结构的关键信息，包括新角色、阵营变化、关系变化等。",
      "2. 所有输出都必须是事实级抽取，而不是分析、评价或推测。",
      "",
      "全局规则：",
      "1. 只能基于本章正文抽取，不得补写未出现的设定或关系。",
      "2. 不得把推测写成事实；信息不明确时不要输出该项。",
      "3. 不要复述剧情，不要写成长段总结，只抽取结构化变化点。",
      "4. 所有角色必须使用明确姓名，不要使用“他”“她”“对方”等代词。",
      "",
      "输出必须严格符合 chapterDynamicExtractionSchema。",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      `目标读者：${input.targetAudience}`,
      `核心卖点：${input.sellingPoint}`,
      `前30章承诺：${input.firstPromise}`,
      `当前卷：${input.currentVolumeTitle}`,
      `已知角色名单：\n${input.rosterText}`,
      `已知结构化关系：\n${input.relationText}`,
      "",
      `章节 ${input.chapterOrder}：《${input.chapterTitle}》`,
      input.chapterContent,
    ].join("\n\n")),
  ],
};
