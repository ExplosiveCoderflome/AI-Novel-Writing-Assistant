import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../core/renderContextBlocks";
import {
  characterCastOptionResponseSchema,
  supplementalCharacterGenerationResponseSchema,
} from "./characterPreparation.promptSchemas";

const CHARACTER_CAST_OPTION_RESPONSE_TEMPLATE = `{
  "options": [
    {
      "title": "string",
      "summary": "string",
      "whyItWorks": "string",
      "recommendedReason": "string",
      "members": [
        {
          "name": "string",
          "role": "string",
          "gender": "male",
          "castRole": "protagonist",
          "relationToProtagonist": "string",
          "storyFunction": "string",
          "shortDescription": "string",
          "outerGoal": "string",
          "innerNeed": "string",
          "fear": "string",
          "wound": "string",
          "misbelief": "string",
          "secret": "string",
          "moralLine": "string",
          "firstImpression": "string"
        }
      ],
      "relations": [
        {
          "sourceName": "string",
          "targetName": "string",
          "surfaceRelation": "string",
          "hiddenTension": "string",
          "conflictSource": "string",
          "secretAsymmetry": "string",
          "dynamicLabel": "string",
          "nextTurnPoint": "string"
        }
      ]
    }
  ]
}`;

const SUPPLEMENTAL_CHARACTER_RESPONSE_TEMPLATE = `{
  "mode": "linked",
  "recommendedCount": 2,
  "planningSummary": "string",
  "candidates": [
    {
      "name": "string",
      "role": "string",
      "gender": "female",
      "castRole": "ally",
      "summary": "string",
      "storyFunction": "string",
      "relationToProtagonist": "string",
      "personality": "string",
      "background": "string",
      "development": "string",
      "outerGoal": "string",
      "innerNeed": "string",
      "fear": "string",
      "wound": "string",
      "misbelief": "string",
      "secret": "string",
      "moralLine": "string",
      "firstImpression": "string",
      "currentState": "string",
      "currentGoal": "string",
      "whyNow": "string",
      "relations": [
        {
          "sourceName": "string",
          "targetName": "string",
          "surfaceRelation": "string",
          "hiddenTension": "string",
          "conflictSource": "string",
          "dynamicLabel": "string",
          "nextTurnPoint": "string"
        }
      ]
    }
  ]
}`;

export interface CharacterCastOptionPromptInput {
  optionCount: number;
}

export interface CharacterCastOptionRepairPromptInput {
  payloadJson: string;
  failureReasons: string[];
}

export interface CharacterCastOptionNormalizePromptInput {
  payloadJson: string;
}

export interface SupplementalCharacterPromptInput {}

export interface SupplementalCharacterNormalizePromptInput {
  payloadJson: string;
}

export const characterCastOptionPrompt: PromptAsset<
  CharacterCastOptionPromptInput,
  z.infer<typeof characterCastOptionResponseSchema>
> = {
  id: "novel.character.castOptions",
  version: "v2",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
    requiredGroups: ["idea_seed", "protagonist_anchor", "output_policy"],
    preferredGroups: [
      "hidden_identity_anchor",
      "project_context",
      "book_contract",
      "macro_constraints",
      "world_stage",
      "forbidden_names",
    ],
  },
  repairPolicy: {
    maxAttempts: 2,
  },
  outputSchema: characterCastOptionResponseSchema,
  render: (input, context) => [
    new SystemMessage([
      "你是长篇中文网文的角色阵容策划师，服务对象是不懂写作流程的新手用户。",
      "你的任务是为当前小说生成可直接进入正文规划的核心角色阵容，而不是输出抽象功能网络。",
      "",
      "只返回严格 JSON，不要输出 Markdown、解释、注释、代码块或额外文本。",
      `必须精确输出 ${input.optionCount} 套方案，不可少于或多于 ${input.optionCount} 套。`,
      "",
      "【结构硬规则】",
      "1. 必须严格遵守给定 JSON 结构。",
      "2. 字段名必须保持英文，字段值内容使用简体中文。",
      "3. 每套方案必须包含 3-6 个成员、2-12 条关系。",
      "4. 每个角色都必须输出 gender，允许值只有 male、female、other、unknown。",
      "5. castRole 只能使用：protagonist, antagonist, ally, foil, mentor, love_interest, pressure_source, catalyst。",
      "",
      "【命名硬规则】",
      "1. name 只能写可直接进入正文的真实人物名、稳定称谓、历史官职称呼、宫廷称呼、江湖称号或阵营身份称呼。",
      "2. 绝对禁止把功能词写进 name，例如：谜团催化剂、知识导师位、外部威胁位、情感位、关系变量、功能位。",
      "3. storyFunction 才负责写叙事职责，name 不负责承载功能描述。",
      "4. 同一方案内的角色名必须彼此可区分，不要出现一批抽象模板称呼。",
      "",
      "【阵容质量要求】",
      "1. 每套方案都必须有明确主角锚点，主角不能写成功能位。",
      "2. 如果故事存在隐藏身份、历史真名、伪装身份或终局身份反转，这条线必须被角色阵容显式承接。",
      "3. 每套方案都要体现真正的人物关系动力、压力来源、成长代价和长期冲突，而不是角色说明书堆砌。",
      "4. 同一方案内不要让多个角色承担几乎相同的 storyFunction。",
      "5. 角色组合必须能支撑长篇推进，而不是只服务开篇一次性爆点。",
      "",
      "【题材约束】",
      "如果上下文是历史、穿越、宫廷、官场或强制度环境题材，阵容必须体现时代身份、制度压迫、权力链条和身份反差，不能退化成通用功能网络。",
      "",
      "【表达要求】",
      "1. 所有描述必须具体，避免“人物鲜明”“关系复杂”“推动剧情”这类空话。",
      "2. 除 summary、whyItWorks、recommendedReason 外，其余文本字段优先控制在短句或短词组。",
      "3. 如果拿不准 gender，填 unknown，不允许留空。",
      "",
      "固定模板如下：",
      CHARACTER_CAST_OPTION_RESPONSE_TEMPLATE,
    ].join("\n")),
    new HumanMessage([
      "请基于以下上下文生成角色阵容方案。",
      "",
      "【分层上下文】",
      renderSelectedContextBlocks(context),
      "",
      "【输出要求】",
      `- 精确输出 ${input.optionCount} 套方案`,
      "- name 必须是可入戏角色名或稳定称谓",
      "- storyFunction 负责写功能，name 不能写成功能位",
      "- 每个角色必须带 gender",
      "- 只输出严格 JSON",
    ].join("\n")),
  ],
};

export const characterCastOptionRepairPrompt: PromptAsset<
  CharacterCastOptionRepairPromptInput,
  z.infer<typeof characterCastOptionResponseSchema>
> = {
  id: "novel.character.castOptions.repair",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: characterCastOptionResponseSchema,
  render: (input, context) => [
    new SystemMessage([
      "你是中文网文角色策划修复编辑，负责把一份已经生成出来但质量不合格的角色阵容 JSON 修正为可直接入库的版本。",
      "你只能修正内容，不要改变整体故事方向。",
      "",
      "只输出一个合法 JSON，不要输出 Markdown、解释、注释或额外文本。",
      "",
      "硬规则：",
      "1. 必须保留原 JSON 的最外层结构和 options 数量。",
      "2. 可以改写 title、summary、members、relations 的内容，但不能删除方案，也不能把 3 套改成别的数量。",
      "3. 必须修正所有功能位式角色名，把它们改成真实可入戏的人名或稳定称谓。",
      "4. 每个角色都必须有 gender，允许值只有 male、female、other、unknown。",
      "5. 所有展示文本必须是自然简体中文，不要保留明显英文残留。",
      "6. 必须保持同一故事方向、主角锚点、核心冲突和隐藏身份线索，不要重写成另一套书。",
      "",
      "重点修复原则：",
      "1. name 不能再出现“某某位、催化剂、威胁源、功能位、关系变量”这类抽象槽位。",
      "2. 如果上下文存在主角当前身份或隐藏身份线索，至少要让主角方案显式承接这些线索。",
      "3. 同一方案内避免多人承担同一故事功能。",
    ].join("\n")),
    new HumanMessage([
      "下面这份 JSON 需要修复。",
      "",
      "【分层上下文】",
      renderSelectedContextBlocks(context),
      "",
      "【失败原因】",
      input.failureReasons.map((reason, index) => `${index + 1}. ${reason}`).join("\n") || "未提供",
      "",
      "【待修复 JSON】",
      input.payloadJson,
      "",
      "请输出修复后的完整 JSON。",
    ].join("\n")),
  ],
};

export const characterCastOptionNormalizePrompt: PromptAsset<
  CharacterCastOptionNormalizePromptInput,
  z.infer<typeof characterCastOptionResponseSchema>
> = {
  id: "novel.character.castOptions.zhNormalize",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: characterCastOptionResponseSchema,
  render: (input) => [
    new SystemMessage([
      "你是中文小说角色策划编辑，负责对角色阵容 JSON 做语言归一化。",
      "你的任务是把所有面向用户展示的文本值改写为自然、流畅、可直接阅读的简体中文表达。",
      "",
      "只输出一个合法 JSON，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "",
      "结构硬规则：",
      "1. 必须严格保留原有 JSON 结构、字段名、层级关系与数组长度。",
      "2. 不得新增字段、删除字段、重命名字段或调整字段顺序。",
      "3. 不得新增或删除数组元素，只允许改写内容。",
      "",
      "内容改写规则：",
      "1. 所有展示文本必须改写为自然简体中文。",
      "2. 保留原有语义、关系含义和角色功能，不得改变设定逻辑。",
      "3. castRole 和 gender 枚举值必须保持原样，不得翻译或改写。",
      "4. 已有中文人名和称谓应尽量保持稳定，不要擅自换名。",
      "5. 不得补写新的剧情、世界设定或关系。",
    ].join("\n")),
    new HumanMessage(
      `请将下面 JSON 中所有展示给用户的文本内容改写为简体中文，并保持结构与含义不变：\n${input.payloadJson}`,
    ),
  ],
};

export const supplementalCharacterPrompt: PromptAsset<
  SupplementalCharacterPromptInput,
  z.infer<typeof supplementalCharacterGenerationResponseSchema>
> = {
  id: "novel.character.supplemental",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: supplementalCharacterGenerationResponseSchema,
  render: (_input, context) => [
    new SystemMessage([
      "你是长篇中文小说项目的补充角色策划师。",
      "你的任务不是重建整套阵容，而是在现有角色系统基础上，精准补足人物压力、情感张力、关系牵引或功能缺口。",
      "",
      "只返回严格 JSON，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "",
      "硬规则：",
      "1. 候选角色必须能直接进入正文使用，不得写成功能占位词。",
      "2. 每个候选都必须输出 gender；拿不准时填 unknown，不得省略。",
      "3. 所有展示文本值必须使用自然、流畅的简体中文。",
      "4. 禁止复用 forbidden names 里的现有角色名。",
      "5. castRole 只能使用：protagonist, antagonist, ally, foil, mentor, love_interest, pressure_source, catalyst。",
      "",
      "补位要求：",
      "1. 候选角色必须真正补足现有阵容缺口，而不是机械再造一个同功能位。",
      "2. mode=linked 时优先形成可持续关系推进；mode=independent 时优先承担独立但高价值的故事职责。",
      "3. 生成结果要服务长篇推进，而不是一次性工具人。",
      "",
      "固定模板如下：",
      SUPPLEMENTAL_CHARACTER_RESPONSE_TEMPLATE,
    ].join("\n")),
    new HumanMessage([
      "请基于以下上下文生成补充角色候选。",
      "",
      "【分层上下文】",
      renderSelectedContextBlocks(context),
      "",
      "【输出要求】",
      "- 角色名必须是具体人名或稳定称谓",
      "- 每个角色必须带 gender",
      "- 只输出严格 JSON",
    ].join("\n")),
  ],
};

export const supplementalCharacterNormalizePrompt: PromptAsset<
  SupplementalCharacterNormalizePromptInput,
  z.infer<typeof supplementalCharacterGenerationResponseSchema>
> = {
  id: "novel.character.supplemental.zhNormalize",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: supplementalCharacterGenerationResponseSchema,
  render: (input) => [
    new SystemMessage([
      "你是中文小说角色策划编辑，负责对补充角色 JSON 做语言归一化与润色。",
      "你的任务是把所有展示给用户的文本值改写为自然、流畅、可直接阅读的简体中文表达。",
      "",
      "只输出一个合法 JSON，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "",
      "结构硬规则：",
      "1. 必须严格保留原有 JSON 结构、字段名、层级关系与数组长度。",
      "2. 不得新增字段、删除字段、重命名字段或调整字段顺序。",
      "3. 不得新增或删除数组元素，只允许改写内容。",
      "",
      "内容改写规则：",
      "1. 所有展示文本必须改写为自然简体中文。",
      "2. 改写时必须保留原有语义、角色功能、关系含义和冲突指向，不得改变设定逻辑。",
      "3. castRole 和 gender 枚举值必须保持原样，不得翻译或改写。",
      "4. 不得补写新的设定、剧情或关系。",
    ].join("\n")),
    new HumanMessage(
      `请将下面 JSON 中所有展示给用户的文本内容改写为简体中文，并保持结构与含义不变：\n${input.payloadJson}`,
    ),
  ],
};
