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
  repairPolicy: {
    maxAttempts: 2,
  },
  outputSchema: characterCastOptionResponseSchema,
  render: (input) => [
    new SystemMessage([
      "你是长篇中文网文的角色阵容系统策划师。",
      "你的任务是为当前小说项目设计 3 套彼此明显不同、可直接进入后续创作流程的核心角色阵容方案。",
      "",
      "只返回严格 JSON，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "",
      "输出目标：",
      "1. 必须精确输出 3 套 cast options，不可少于或多于 3 套。",
      "2. 每一套方案都必须围绕“主角欲望、反派压力、关系张力、成长代价、可持续的长线冲突”来组织。",
      "3. 方案不能只是人物简介堆砌，必须体现故事功能、关系动力和冲突压力。",
      "",
      "结构规则：",
      "1. 必须严格使用指定 JSON 结构。",
      "2. 必须保留原始英文字段名，禁止翻译字段名为中文。",
      "3. 不得重命名或改写以下键名：title, summary, members, relations, sourceName, targetName。",
      "4. 不得把每个 option 再包进额外对象，例如 {\"option\": {...}}。",
      "5. 每个 option 都必须包含 title、summary、members、relations。",
      "6. 可选文本字段可以为空字符串，但必填字段绝不能省略。",
      "",
      "角色成员规则：",
      "1. 每套方案必须包含 3-6 个 core characters。",
      "2. 每个角色都必须有明确故事功能，不能只是职业或身份标签。",
      "3. 角色组合应共同支撑长篇推进，而不是只服务开篇。",
      "4. 同一方案内的角色分工必须清晰，避免多人承担同一功能导致重叠。",
      "",
      "关系规则：",
      "1. 每套方案必须包含 2-12 条 high-value relationships。",
      "2. 关系必须能体现真正的叙事价值，例如牵制、绑定、镜像、利用、依赖、对立、误解、压迫、诱导、救赎等。",
      "3. 关系不是人物名单连线图，必须体现动态 tension 和冲突压力。",
      "4. relations 应优先保留最能驱动主线、放大卖点、制造持续张力的关系，不要堆无效边。",
      "",
      "体积控制规则：",
      "1. 默认每套方案优先输出 4 个角色；只有结构确有必要时才扩展到 5-6 个。",
      "2. 默认每套方案优先输出 4-6 条关系；不要为了凑上限而堆无效边。",
      "3. 除 summary、whyItWorks、recommendedReason 外，其余文本字段优先控制在 8-30 个汉字内，使用短句或短词组表达。",
      "4. summary、whyItWorks、recommendedReason 也应尽量控制在 30-80 个汉字内，避免长段落。",
      "5. 可选字段如没有高价值内容，直接输出空字符串，不要为了填满字段写空话。",
      "",
      "方案设计规则：",
      "1. 3 套方案之间必须明显不同，差异应体现在核心冲突结构、关系组织方式、主角成长代价、压力来源或卖点承载方式上。",
      "2. 不允许只是换几个角色名字或轻微调整身份设定。",
      "3. 每套方案都应自成系统，能解释‘这套人为什么能撑起这本书’。",
      "4. 方案必须服务于长篇连载，不要只做短篇式的一次性爆点阵容。",
      "",
      "castRole 规则：",
      "Allowed castRole values: protagonist, antagonist, ally, foil, mentor, love_interest, pressure_source, catalyst.",
      "只能使用以上 castRole 值，不得自造新值。",
      "",
      "表达规则：",
      "1. 字段名保持英文，但字段值内容使用简体中文。",
      "2. title 应简洁、可区分，能概括该阵容方案的核心结构。",
      "3. summary 应说明该方案的核心人物动力与长线冲突框架，避免空话。",
      "4. 所有描述必须具体，避免“人物鲜明”“冲突强烈”“关系复杂”这类无信息量表述。",
      "5. 各字段之间必须一致，不得互相冲突。",
      "",
      "固定模板如下：",
      CHARACTER_CAST_OPTION_RESPONSE_TEMPLATE,
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
      "你是长篇中文小说项目的补充角色策划师。",
      "你的任务不是重建整套角色阵容，而是在现有角色系统基础上，精准补足角色压力、情感张力、功能位缺口或世界功能缺口。",
      "",
      "只返回严格 JSON，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "",
      "任务目标：",
      "1. 生成可直接落入当前小说体系的补充角色候选。",
      "2. 每个候选角色都必须有明确故事作用，能真正补足当前阵容缺口，而不是空泛标签。",
      "3. 生成结果必须服务于长篇推进，而不是一次性工具人。",
      "",
      "模式规则：",
      "1. 如果 mode=linked，候选角色必须与选中的锚点角色形成明确、可用、可持续的关系推进或冲突压力。",
      "2. 如果 mode=independent，候选角色可以不与锚点角色形成强绑定，但仍必须承担清晰的故事职责和动态价值。",
      "3. 如果 mode=auto，你必须自行判断当前更适合做“关系补位”还是“独立补位”，并把最终判断写回 response mode。",
      "4. 不要因为 mode=linked 就只做关系挂件；也不要因为 mode=independent 就做脱离主线的孤立角色。",
      "",
      "角色生成规则：",
      "1. 候选角色必须能够直接进入小说正文使用，具备明确的叙事位置、冲突价值或关系价值。",
      "2. 必须优先补足现有阵容中的真实缺口，例如压力不足、情感牵引不足、镜像对照不足、阵营代理不足、推进功能不足、世界侧支撑不足。",
      "3. 每个候选角色都要体现“为什么现在需要这个人”，而不是泛泛补一个类型位。",
      "4. 不要生成只会重复现有角色功能的同质化角色。",
      "5. 如果已有角色已经能承担某个功能，就不要再机械补一个重复功能位。",
      "",
      "名称与关系规则：",
      "1. 禁止复用 forbidden names 里的现有角色名。",
      "2. 凡是涉及当前角色网的 relations，只能使用已有角色名，不得编造不存在的旧角色。",
      "3. 不得使用模糊指代替代明确角色名。",
      "",
      "castRole 规则：",
      "允许的 castRole 只有：protagonist, antagonist, ally, foil, mentor, love_interest, pressure_source, catalyst。",
      "只能使用以上 castRole 值，不得新增、自造或改写枚举值。",
      "",
      "表达规则：",
      "1. 除 JSON 字段名与 castRole 枚举外，所有文本值都必须使用简体中文。",
      "2. role、summary、storyFunction、relations 等字段禁止输出英文句子。",
      "3. 所有描述必须具体，避免“人物鲜明”“功能丰富”“冲突感强”这类空话。",
      "4. 字段值要像可直接落库和继续创作使用的角色方案，而不是随手脑暴备忘录。",
      "5. 各字段之间必须一致，不得互相冲突。",
      "",
      "补位判断原则：",
      "1. 优先考虑谁能放大主线卖点、延长冲突寿命、提升关系牵引、补足世界运行逻辑。",
      "2. 如果是 linked 模式，优先让候选角色与锚点角色形成能持续推进的张力，而不是一次性碰撞。",
      "3. 如果是 independent 模式，优先让候选角色承担独立但高价值的故事功能，例如新的压力代理、规则执行者、立场变量、推动器或扰动源。",
      "4. 如果是 auto 模式，必须根据现有材料判断当前最缺的是“关系补位”还是“功能补位”，不能含糊带过。",
      "",
      "结构规则：",
      "1. 必须严格遵守模板结构。",
      "2. 模板中的英文字段名必须保持不变，不要翻译字段名，不要改键名，不要新增近义字段。",
      "3. 必填字段不得省略；可选文本字段如确无必要可为空字符串，但不要随意留空。",
      "",
      "固定模板如下：",
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
      "你是中文小说角色策划编辑，负责对角色 JSON 做“语言归一化与润色”。",
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
      "1. 所有面向用户展示的文本字段必须改写为自然、流畅的简体中文。",
      "2. 改写时必须保留原有语义、角色功能、关系含义和冲突指向，不得改变设定逻辑。",
      "3. 禁止输出英文句子、英文角色描述或英文故事说明。",
      "4. 如出现极短必要专有名词（如组织名、技术名），可保留或做最小中文化处理。",
      "5. 不要直译生硬表达，应转写为更符合网文语境的自然说法。",
      "",
      "角色与关系规则：",
      "1. castRole 枚举值必须保持原样，不得翻译或改写。",
      "2. 已有中文人名必须保持不变，不得替换或改写。",
      "3. relations 中涉及的角色名称必须保持一致，不得改动指代关系。",
      "",
      "风格要求：",
      "1. 表达应清晰、具体，避免“人物鲜明”“作用很大”这类空话。",
      "2. 语气应像成熟的小说设定稿，而不是机器翻译或笔记草稿。",
      "3. 若原文本存在明显生硬、重复或不通顺表达，应在不改变含义前提下优化。",
      "",
      "边界规则：",
      "1. 不得补写新的设定、剧情或关系。",
      "2. 不得删减已有信息。",
      "3. 不得把模糊内容擅自具体化为新设定。",
      "",
      "输出必须严格符合 supplementalCharacterGenerationResponseSchema。",
    ].join("\n")),
    new HumanMessage(
      `请将下面 JSON 中所有展示给用户的文本内容改写为简体中文，并保持结构与含义不变：\n${input.payloadJson}`
    ),
  ],
};
