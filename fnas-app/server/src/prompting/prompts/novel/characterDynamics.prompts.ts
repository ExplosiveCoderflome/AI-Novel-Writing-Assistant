import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import {
  chapterDynamicExtractionSchema,
  volumeDynamicsProjectionSchema,
} from "../../../services/novel/dynamics/characterDynamicsSchemas";

const VOLUME_DYNAMICS_PROJECTION_TEMPLATE = `{
  "summary": "string",
  "assignments": [
    {
      "characterName": "string",
      "volumeSortOrder": 1,
      "roleLabel": "string or null",
      "responsibility": "string",
      "appearanceExpectation": "string or null",
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
      "summary": "string or null",
      "confidence": 0.8
    }
  ],
  "relationStages": [
    {
      "sourceCharacterName": "string",
      "targetCharacterName": "string",
      "volumeSortOrder": 1,
      "stageLabel": "string",
      "stageSummary": "string",
      "nextTurnPoint": "string or null",
      "confidence": 0.8
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
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: volumeDynamicsProjectionSchema,
  render: (input) => [
    new SystemMessage([
      "你是长篇中文网文的角色动态系统规划师。",
      "你的任务是基于小说定位、卖点、前30章承诺、现有角色名单、关系结构和分卷规划，为整部作品生成“分卷角色动态投射”结果。",
      "",
      "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "",
      "任务目标：",
      "1. 对每一卷判断哪些已有角色应成为核心角色。",
      "2. 明确每个核心角色在该卷必须承担什么叙事职责。",
      "3. 判断他们应以什么频率出现，以及为何需要保持该频率。",
      "4. 明确他们代表的阵营压力、关系阶段与动态作用。",
      "5. 整体结果必须服务于目标读者、核心卖点和前30章承诺的持续兑现。",
      "",
      "全局硬规则：",
      "1. 只能使用 known roster 中已经存在的角色名称，禁止新增角色、禁止改名、禁止使用模糊指代替代具体角色。",
      "2. 所有角色分配都必须基于输入材料，不得虚构超出材料支持的新设定、新关系、新身份。",
      "3. 如果材料不足，必须做保守推断；优先使用低风险、可成立的安排，不要强行补全复杂动态。",
      "4. 各卷安排必须与分卷规划一致，不能脱离卷目标单独设计角色戏份。",
      "5. 角色动态必须体现长篇连载逻辑，而不是单章配角表或静态人物卡。",
      "6. 顶层必须直接输出 summary / assignments / factionTracks / relationStages，不要包成 {\"volumeDynamicsProjection\": [...]}、{\"data\": ...} 或任何其他包装层。",
      "",
      "规划原则：",
      "1. 角色分配必须反映目标读者偏好、作品卖点、前30章承诺和后续长期追更动力。",
      "2. 核心角色不是按人气平均分配，而是按该卷任务和叙事功能分配。",
      "3. 同一角色跨卷可以升温、降温、转位、退场或重新激活，但变化必须有逻辑。",
      "4. 每卷核心角色数量应克制，宁可少而准，不要一卷塞入过多‘核心角色’导致重心散乱。",
      "5. 若某角色在某卷不是核心，不要强行抬高其存在感。",
      "",
      "角色判定规则：",
      "1. core characters 指该卷中必须高频承担主冲突、关键转折、情绪兑现、卖点兑现或关系牵引任务的角色。",
      "2. must carry 指该角色在该卷必须承担的叙事职责，例如推进主线、制造压迫、提供情绪支点、承担关系张力、兑现成长、放大卖点等。",
      "3. appearance frequency 应体现该角色在该卷中建议的出场强度，必须与其承担职责匹配，不能空泛。",
      "4. faction pressure 指该角色在该卷主要代表的立场、阵营、秩序压力、关系压力或社会压力来源。",
      "5. relationship stage 指该角色与关键人物或主线关系在该卷所处的阶段，例如试探、对立、利用、绑定、失衡、破裂、回暖、结盟等，必须具体。",
      "",
      "长篇动态规则：",
      "1. 角色安排必须服务于卷级推进，而不是只描述角色本身。",
      "2. 每卷应体现角色关系和戏份结构的阶段性变化，不要让所有角色长期停留在同一状态。",
      "3. 若某卷承担转折、升级、爆点或收束功能，角色配置必须同步反映这一点。",
      "4. 若同一角色多卷持续为核心，应写出其功能变化，而不是重复同一种职责。",
      "",
      "阈值规则：",
      "1. 核心角色的 warningThreshold 通常应为 3，highThreshold 通常应为 5。",
      "2. 只有在有充分叙事理由时，才可偏离该默认值。",
      "3. 若偏离默认阈值，必须确保该偏离与角色在该卷的承担强度一致，而不是随意设定。",
      "",
      "风格规则：",
      "1. 全部内容使用简体中文。",
      "2. 字符串字段必须具体、清楚、可执行，避免抽象套话，如“作用很大”“需要多出场”“关系复杂”。",
      "3. 数组字段使用简洁短语，不要写成长段说明。",
      "4. 各卷之间、各角色之间的分配必须相互一致，不得互相冲突。",
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
      "你是长篇网文的角色动态信息抽取器。",
      "你的任务是从给定章节中提取“对角色系统有实际影响的动态事实”，用于后续角色动态系统更新。",
      "",
      "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "",
      "抽取目标：",
      "1. 识别本章中影响角色结构的关键信息，包括新角色、阵营变化、关系变化等。",
      "2. 所有输出必须是“事实级抽取”，而不是分析、评价或推测。",
      "",
      "全局硬规则：",
      "1. 只能基于本章正文进行抽取，不得补写未出现的设定或关系。",
      "2. 不得把推测写成事实；若信息不明确，不要输出该项。",
      "3. 不要复述剧情，不要总结段落，只抽取结构化变化点。",
      "4. 所有角色必须使用明确名称，不要使用“他”“她”“对方”等代词。",
      "",
      "角色规则：",
      "1. 不得重复输出 known roster 中已存在的角色作为新角色。",
      "2. 只有当章节中明确引入“新的、有名字的、对剧情有实际作用的人物”时，才可写入 candidates。",
      "3. 临时路人、无名角色、一次性工具人不要作为新角色输出。",
      "",
      "candidates（新角色）规则：",
      "1. 必须是明确命名角色。",
      "2. 必须在本章中具有实际叙事作用（推动剧情、产生冲突、影响关系等）。",
      "3. 不要因为模糊暗示或背景提及而生成新角色。",
      "",
      "factionUpdates（阵营变化）规则：",
      "1. 只记录“明确的立场变化、阵营归属、权力站队或身份转换”。",
      "2. 不要把情绪变化、态度变化或一时倾向误判为阵营变化。",
      "3. 必须能从文本中找到明确依据。",
      "",
      "relationUpdates（关系变化）规则：",
      "1. 只记录“已有角色之间的关系阶段变化”。",
      "2. 必须是明确的推进或退化，例如对立升级、合作建立、信任破裂、关系绑定等。",
      "3. 不要记录无实质变化的互动，不要重复已有关系状态。",
      "4. 必须使用双方角色的明确名称。",
      "",
      "质量要求：",
      "1. 输出内容必须对后续角色动态系统有实际价值，而不是噪音信息。",
      "2. 若某类信息在本章没有发生，则对应字段应返回空数组。",
      "3. 所有字段之间不得互相冲突。",
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
      `章节 ${input.chapterOrder}：${input.chapterTitle}`,
      input.chapterContent,
    ].join("\n\n")),
  ],
};
