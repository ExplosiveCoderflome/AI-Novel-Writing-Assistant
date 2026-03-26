import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import {
  characterCastOptionResponseSchema,
  supplementalCharacterGenerationResponseSchema,
} from "../../../services/novel/characterPrep/characterPreparationSchemas";

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
  promptSections: string[];
}

export interface SupplementalCharacterPromptInput {
  promptSections: string[];
}

export interface SupplementalCharacterNormalizePromptInput {
  payloadJson: string;
}

export const characterCastOptionPrompt: PromptAsset<
  CharacterCastOptionPromptInput,
  z.infer<typeof characterCastOptionResponseSchema>
> = {
  id: "novel.character.castOptions",
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
      "You are designing the long-form character system for a novel project.",
      "Return strict JSON only.",
      "Produce exactly 3 distinct cast options.",
      "Each option must focus on protagonist desire, antagonist pressure, relationship tension, growth cost, and sustainable long-arc conflict.",
      "Each option must contain 3-6 core characters and 2-12 high-value relationships.",
      "Do not output shallow bio cards only. Include story function, relationship dynamics, and conflict pressure.",
      "Allowed castRole values: protagonist, antagonist, ally, foil, mentor, love_interest, pressure_source, catalyst.",
      "Use the exact JSON shape below and keep the exact English field names.",
      CHARACTER_CAST_OPTION_RESPONSE_TEMPLATE,
      "Do not translate field names into Chinese.",
      "Do not rename keys like title, summary, members, relations, sourceName, or targetName.",
      "Do not wrap each option inside another object such as {\"option\": {...}}.",
      "Every option must include title, summary, members, and relations.",
      "Optional text fields may be empty strings, but required fields must never be omitted.",
    ].join("\n")),
    new HumanMessage(input.promptSections.join("\n\n")),
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
  render: (input) => [
    new SystemMessage([
      "你正在为长篇中文小说项目补充角色。",
      "只返回严格 JSON。",
      "你的任务是在不重建整套阵容的前提下，补足角色压力、情感张力、功能位或世界功能缺口。",
      "如果 mode=linked，候选角色必须与选中的锚点角色形成可用的关系推进或冲突压力。",
      "如果 mode=independent，可以没有强绑定关系，但仍必须承担明确故事作用。",
      "如果 mode=auto，请自己判断更适合做关系补位还是独立补位，并把结论写回 response mode。",
      "禁止复用 forbidden names 里的现有角色名。",
      "凡是涉及当前角色网的 relations，只能使用已有角色名。",
      "允许的 castRole 只有：protagonist, antagonist, ally, foil, mentor, love_interest, pressure_source, catalyst。",
      "除 JSON 字段名与 castRole 枚举外，所有文本值都必须使用简体中文。",
      "role、summary、storyFunction、relations 等字段禁止输出英文句子。",
      "每个候选角色都必须可以直接落到小说里，而不是空泛标签。",
      "下面模板里的英文字段名必须保持不变。",
      SUPPLEMENTAL_CHARACTER_RESPONSE_TEMPLATE,
    ].join("\n")),
    new HumanMessage(input.promptSections.join("\n\n")),
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
      "你是中文小说角色策划编辑。",
      "请把输入 JSON 中所有展示给用户的文本值改写成自然、流畅的简体中文。",
      "必须保留原有 JSON 结构、字段名、数组长度和关系含义。",
      "castRole 枚举值必须保持原样，不能翻译。",
      "已有中文人名必须保持不变，不要改成英文。",
      "禁止输出英文句子、英文角色描述、英文故事作用，除非是极短必要专有名词。",
      "只输出合法 JSON。",
    ].join("\n")),
    new HumanMessage(`请把下面 JSON 中所有展示给用户的文本内容都改成简体中文，保持角色功能与关系含义不变：\n${input.payloadJson}`),
  ],
};
