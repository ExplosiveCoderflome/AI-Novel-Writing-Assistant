import type { WorldReferenceMode } from "@ai-novel/shared/types/worldWizard";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import {
  type WorldAxiomSuggestionPromptInput,
  type WorldConsistencyPromptInput,
  type WorldDeepeningQuestionsPromptInput,
  type WorldImportExtractionPromptInput,
  type WorldInspirationConceptCardLocalizationPromptInput,
  type WorldInspirationConceptCardPromptInput,
  type WorldLayerGenerationPromptInput,
  type WorldLayerLocalizationPromptInput,
  type WorldPropertyOptionsPromptInput,
  type WorldReferenceInspirationPromptInput,
  type WorldStructureBackfillPromptInput,
  type WorldStructureSectionPromptInput,
  type WorldVisualizationPromptInput,
} from "./world.promptTypes";
import {
  worldAxiomSuggestionSchema,
  worldConceptCardSchema,
  worldConsistencyIssuesSchema,
  worldDeepeningQuestionsSchema,
  worldImportExtractionSchema,
  worldLooseObjectSchema,
  worldPropertyOptionsPayloadSchema,
} from "./world.promptSchemas";
import { worldReferenceInspirationPayloadSchema } from "../../../services/world/worldReferenceSchema";
import { worldStructuredDataSchema, worldStructureSectionOutputSchema } from "../../../services/world/worldSchemas";
import { worldVisualizationDraftSchema } from "../../../services/world/worldVisualizationSchema";
import {
  buildStructureSectionInstructions,
} from "../../../services/world/worldServiceShared";

function buildReferenceModeLabel(mode: WorldReferenceMode | null | undefined): string {
  switch (mode) {
    case "extract_base":
      return "提取原作世界基底";
    case "tone_rebuild":
      return "借用原作气质与结构重建";
    case "adapt_world":
    default:
      return "基于原作做架空改造";
  }
}

function sanitizeLooseWorldObject(value: unknown, allowedKeys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须返回 JSON 对象。`);
  }

  const record = value as Record<string, unknown>;
  const normalizedAllowedKeys = new Set(allowedKeys.map((key) => key.trim()).filter(Boolean));
  if (normalizedAllowedKeys.size === 0) {
    throw new Error(`${label} 缺少允许字段配置。`);
  }

  const filteredEntries = Object.entries(record).filter(([key, fieldValue]) => {
    if (!normalizedAllowedKeys.has(key)) {
      return false;
    }
    return fieldValue != null;
  });

  if (filteredEntries.length === 0) {
    throw new Error(`${label} 没有返回任何允许字段。`);
  }

  return Object.fromEntries(filteredEntries);
}

function normalizeWorldStructureSectionPayload(
  value: z.infer<typeof worldStructureSectionOutputSchema>,
  input: WorldStructureSectionPromptInput,
): z.infer<typeof worldStructureSectionOutputSchema> {
  const arraySections = new Set(["factions", "locations"]);
  const shouldReturnArray = arraySections.has(input.section);

  if (shouldReturnArray) {
    if (!Array.isArray(value)) {
      throw new Error(`world.structure.generate 在 section=${input.section} 时必须返回数组。`);
    }
    return value;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`world.structure.generate 在 section=${input.section} 时必须返回对象。`);
  }
  return value;
}

export const worldReferenceInspirationPrompt: PromptAsset<
  WorldReferenceInspirationPromptInput,
  z.infer<typeof worldReferenceInspirationPayloadSchema>
> = {
  id: "world.reference.inspiration",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldReferenceInspirationPayloadSchema,
  render: (input) => [
    new SystemMessage(`你是参考作品世界分析师。
你的任务不是重新发明一套无关的新故事，而是从参考材料中提炼“可保留的世界基底”和“可用于架空改造的决策边界”。
请严格输出 JSON 对象：
{
  "conceptCard": {
    "worldType": "...",
    "templateKey": "custom",
    "coreImagery": ["..."],
    "tone": "...",
    "keywords": ["..."],
    "summary": "..."
  },
  "anchors": [
    {
      "id": "anchor-1",
      "label": "...",
      "content": "..."
    }
  ],
  "seedPackage": {
    "rules": [
      {
        "id": "reference-rule-1",
        "name": "...",
        "summary": "...",
        "cost": "...",
        "boundary": "...",
        "enforcement": "..."
      }
    ],
    "factions": [
      {
        "id": "reference-faction-1",
        "name": "...",
        "position": "...",
        "doctrine": "...",
        "goals": ["..."],
        "methods": ["..."],
        "representativeForceIds": ["reference-force-1"]
      }
    ],
    "forces": [
      {
        "id": "reference-force-1",
        "name": "...",
        "type": "...",
        "factionId": "reference-faction-1",
        "summary": "...",
        "baseOfPower": "...",
        "currentObjective": "...",
        "pressure": "...",
        "leader": "...",
        "narrativeRole": "..."
      }
    ],
    "locations": [
      {
        "id": "reference-location-1",
        "name": "...",
        "terrain": "...",
        "summary": "...",
        "narrativeFunction": "...",
        "risk": "...",
        "entryConstraint": "...",
        "exitCost": "...",
        "controllingForceIds": ["reference-force-1"]
      }
    ]
  }
}
规则：
1. 只输出 JSON，不要输出解释。
2. templateKey 固定为 "custom"。
3. anchors 必须提供 4-6 个，优先覆盖现实基底、城市地点结构、社会压力、行业生态、关系结构、世界边界。
4. anchors 必须是世界层或世界-故事接口层，不要写具体剧情桥段、男女主感情推进、角色单独动机。
5. summary 要说明这次参考模式下“哪些应保留、哪些可以改造”，而不是泛泛重写题材。
6. seedPackage 用来提取“可以直接沿用的原作设定”，允许为空数组，但不要凭空编造。
7. 优先提取世界规则、阵营立场、具体组织/势力、地点/场景这四类可复用内容。
8. 所有文本使用简体中文。`),
    new HumanMessage(input.userPrompt),
  ],
};

export const worldVisualizationPrompt: PromptAsset<
  WorldVisualizationPromptInput,
  z.infer<typeof worldVisualizationDraftSchema>
> = {
  id: "world.visualization.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldVisualizationDraftSchema,
  render: (input) => [
    new SystemMessage(`你是世界观可视化抽取器。请严格输出 JSON 对象，结构为：
{
  "factionGraph": {
    "nodes": [{"id":"faction-1","label":"...","type":"state|faction|race|organization|other"}],
    "edges": [{"source":"faction-1","target":"faction-2","relation":"同盟|合作|支援|对抗|敌对|统属|压制|贸易|竞争|中立|关联"}]
  },
  "powerTree": [{"level":"L1","description":"..."}],
  "geographyMap": {
    "nodes": [{"id":"geo-1","label":"..."}],
    "edges": [{"source":"geo-1","target":"geo-2","relation":"相邻|通道|隔绝|控制"}]
  },
  "timeline": [{"year":"...","event":"..."}]
}
要求：
1. 只抽取文本里明确存在或强可推断的信息，不要编造。
2. factionGraph 必须优先反映真实势力关系，不要用泛化的 interaction。
3. 所有 label、relation、description、event 必须使用简体中文。
4. 节点数量控制在 4-12 个，优先核心势力。`),
    new HumanMessage(input.worldPromptSource),
  ],
};

export const worldInspirationConceptCardPrompt: PromptAsset<
  WorldInspirationConceptCardPromptInput,
  z.infer<typeof worldConceptCardSchema>
> = {
  id: "world.inspiration.concept_card",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldConceptCardSchema,
  render: (input) => [
    new SystemMessage(
      `请输出世界灵感概念卡 JSON，所有文本字段必须使用简体中文：
{
  "worldType":"...",
  "templateKey":"${input.templateKeysText}",
  "coreImagery":["..."],
  "tone":"...",
  "keywords":["..."],
  "summary":"3-5句中文摘要"
}
只输出 JSON，不要输出解释。`,
    ),
    new HumanMessage(
      `模式=${input.mode}
世界类型提示=${input.worldTypeHint}
灵感文本=${input.promptText}
是否分段提取=${input.extracted ? "是" : "否"}
原文长度=${input.originalLength} 字符
可用世界观素材检索=${input.ragContext || "无"}`,
    ),
  ],
};

export const worldInspirationConceptCardLocalizationPrompt: PromptAsset<
  WorldInspirationConceptCardLocalizationPromptInput,
  z.infer<typeof worldConceptCardSchema>
> = {
  id: "world.inspiration.localize_concept_card",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldConceptCardSchema,
  render: (input) => [
    new SystemMessage(
      `将输入的概念卡翻译并润色为简体中文，保持 JSON 结构不变：
{
  "worldType":"...",
  "templateKey":"...",
  "coreImagery":["..."],
  "tone":"...",
  "keywords":["..."],
  "summary":"..."
}
仅输出 JSON。`,
    ),
    new HumanMessage(input.conceptCardJson),
  ],
};

export const worldPropertyOptionsPrompt: PromptAsset<
  WorldPropertyOptionsPromptInput,
  z.infer<typeof worldPropertyOptionsPayloadSchema>
> = {
  id: "world.property_options.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldPropertyOptionsPayloadSchema,
  render: (input) => {
    const isReferenceMode = Boolean(input.referenceMode);
    return [
      new SystemMessage(
        isReferenceMode
          ? `你是参考作品架空改造规划师。
请根据用户给出的参考作品锚点、保留要求和改造边界，输出 JSON 对象：
{
  "options": [
    {
      "id": "可选",
      "name": "属性名称",
      "description": "40-90字，说明这个属性决定什么，以及为什么值得在生成前就做选择",
      "targetLayer": "foundation|power|society|culture|history|conflict",
      "reason": "一句话说明它为什么值得优先决策",
      "choices": [
        {
          "id": "choice-a",
          "label": "方向 A",
          "summary": "说明这个方向如何改造原作世界"
        }
      ]
    }
  ]
}
规则：
1. 只输出 JSON 对象，不要输出解释。
2. options 数量必须与要求数量一致。
3. 所有文本必须使用简体中文。
4. targetLayer 只能是 foundation、power、society、culture、history、conflict。
5. 每个 options 都必须包含 2-4 个 choices。
6. choices 必须是互斥的分支方向，而不是同义改写。
7. 不要生成角色动机、感情推进、具体桥段这类故事层选项，要优先生成世界层改造轴。`
          : `你是小说世界生成器的前置决策规划师。
请根据用户的世界类型、概念卡和参考素材，输出 JSON 对象：
{
  "options": [
    {
      "id": "可选",
      "name": "属性名称",
      "description": "40-90字，说明这个属性决定什么，以及为什么值得在生成前就做选择",
      "targetLayer": "foundation|power|society|culture|history|conflict",
      "reason": "一句话说明它为什么值得优先决策"
    }
  ]
}
规则：
1. 只输出 JSON 对象，不要输出解释。
2. options 数量必须与要求数量一致。
3. 所有文本必须使用简体中文。
4. targetLayer 只能是 foundation、power、society、culture、history、conflict。
5. 不要生成“世界名称”“世界简介”这类过于宽泛的伪选项，要生成真正可选的设定方向。`,
      ),
      new HumanMessage(
        isReferenceMode
          ? [
            `参考方式：${buildReferenceModeLabel(input.referenceMode)}`,
            input.referenceAnchors && input.referenceAnchors.length > 0
              ? `原作世界锚点：\n${input.referenceAnchors.map((item) => `- ${item.label}：${item.content}`).join("\n")}`
              : "",
            input.preserveElements && input.preserveElements.length > 0
              ? `必须保留：${input.preserveElements.join("、")}`
              : "",
            input.allowedChanges && input.allowedChanges.length > 0
              ? `允许改造：${input.allowedChanges.join("、")}`
              : "",
            input.forbiddenElements && input.forbiddenElements.length > 0
              ? `禁止偏离：${input.forbiddenElements.join("、")}`
              : "",
            `请生成 ${input.optionsCount} 个“架空改造前必须先决定”的关键世界决策项。`,
            "这些决策项必须围绕参考作品的世界基底展开，而不是重新发明一套无关的新故事。",
            "要求：",
            "1. 每个决策项都必须是世界层或世界-故事接口层的改造轴，不要写角色动机、具体剧情桥段、男女主感情推进节奏。",
            "2. 每个决策项都必须给出 2-4 个互斥的可选方向 choices，让用户真的能选分支。",
            "3. choices 之间必须体现不同架空路线，例如保留现实、半架空、加入隐性规则，而不是同义改写。",
            "4. 优先围绕现实基底、城市规则、社会压迫结构、地点系统、势力网络、公开与隐秘边界这类真正影响世界的决策。",
            "5. 不要把原作的核心气质彻底改没；如果某个改造方向会让作品失真，应在说明里体现边界。",
            input.retryStrict
              ? "6. 请严格返回 JSON，不要添加任何解释；如果不确定，也必须先给出结构化候选，不要省略 options。"
              : "",
          ].filter(Boolean).join("\n")
          : [
            `世界类型：${input.worldType}`,
            `模板：${input.templateName}`,
            `模板说明：${input.templateDescription}`,
            input.classicElements.length > 0 ? `可参考的经典元素：${input.classicElements.join("、")}` : "",
            input.pitfalls.length > 0 ? `需要避开的常见坑点：${input.pitfalls.join("、")}` : "",
            `世界概念摘要：${input.conceptSummary}`,
            input.coreImagery.length > 0 ? `核心意象：${input.coreImagery.join("、")}` : "",
            input.keywords.length > 0 ? `关键词：${input.keywords.join("、")}` : "",
            input.tone.trim() ? `整体基调：${input.tone.trim()}` : "",
            input.sourcePrompt.trim() ? `用户原始灵感：${input.sourcePrompt.trim()}` : "",
            input.ragContext?.trim() ? `可参考素材：${input.ragContext.trim()}` : "",
            `请生成 ${input.optionsCount} 个“适合在正式生成世界前先做决定”的关键世界属性选项。`,
            "这些选项需要延续旧版 V2 世界生成器里“先选属性、再补细节”的思路。",
            "要求：",
            "1. 每个属性都必须是具体、可选择、会影响后续世界构建方向的前置决策。",
            "2. 属性之间尽量独立，但组合起来能形成连贯世界。",
            "3. 优先覆盖真正重要的分歧点，而不是世界名称、世界简介这类宽泛项。",
            "4. 属性描述要明确，让用户一眼知道自己在决定什么。",
            "5. 尽量兼顾基础层、力量层、社会层、文化层、历史层、冲突层，不要全部挤在同一层。",
            "6. 可以参考经典网文世界搭建逻辑，但不要陈词滥调，要有辨识度。",
            input.retryStrict
              ? "7. 请严格返回 JSON，不要添加任何解释；如果不确定，也必须先给出结构化候选，不要省略 options。"
              : "",
          ].filter(Boolean).join("\n"),
      ),
    ];
  },
};

export const worldDeepeningQuestionsPrompt: PromptAsset<
  WorldDeepeningQuestionsPromptInput,
  z.infer<typeof worldDeepeningQuestionsSchema>
> = {
  id: "world.deepening.questions",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldDeepeningQuestionsSchema,
  render: (input) => [
    new SystemMessage(
      `Output JSON array with 2-3 items only, each item:
{
  "priority":"required|recommended|optional",
  "question":"...",
  "quickOptions":["...", "...", "..."],
  "targetLayer":"foundation|power|society|culture|history|conflict",
  "targetField":"..."
}
Rules:
- quickOptions must have 2-4 concise candidate answers in Simplified Chinese.
- Only output JSON array.`,
    ),
    new HumanMessage(
      `name=${input.worldName}
description=${input.description || "none"}
data=${input.dataJson}
ragContext=${input.ragContext || "none"}`,
    ),
  ],
};

export const worldConsistencyPrompt: PromptAsset<
  WorldConsistencyPromptInput,
  z.infer<typeof worldConsistencyIssuesSchema>
> = {
  id: "world.consistency.check",
  version: "v1",
  taskType: "review",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldConsistencyIssuesSchema,
  render: (input) => [
    new SystemMessage(
      `你是世界观一致性审校器。请只输出 JSON 数组。
每项结构：
{"severity":"warn|error","code":"...","message":"中文问题概述","detail":"中文详细说明","targetField":"description|background|geography|cultures|magicSystem|politics|races|religions|technology|conflicts|history|economy|factions"}
要求：
1. message 和 detail 必须使用简体中文。
2. 只指出真正的冲突或明显风险，不要泛泛而谈。
3. 如果没有问题，只输出 []。`,
    ),
    new HumanMessage(
      `世界名：${input.worldName}
世界公理：${input.axioms || "无"}
核心设定：${input.coreSettingsJson}
检索补充：${input.ragContext || "无"}`,
    ),
  ],
};

export const worldLayerGenerationPrompt: PromptAsset<
  WorldLayerGenerationPromptInput,
  z.infer<typeof worldLooseObjectSchema>
> = {
  id: "world.layer.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldLooseObjectSchema,
  render: (input) => [
    new SystemMessage(
      `你是世界观分层构建器，只负责生成 layer=${input.layerKey} 对应字段。
必须输出 JSON 对象，且字段只能来自：${input.targetFields.join(", ")}。
要求：
1. 必须遵守世界公理、模板约束、用户前置蓝图选择和既有已生成内容。
2. 不要写空泛摘要，要写能直接用于小说创作的具体设定。
3. 当前层必须与前面层形成因果或结构关联，而不是孤立描述。
4. 所有字段值必须使用简体中文。
5. 只输出 JSON，不要输出解释。`,
    ),
    new HumanMessage(
      `name=${input.worldName}
worldType=${input.worldType}
template=${input.templateName}
templateDescription=${input.templateDescription}
classicElements=${input.classicElements.join(" | ") || "none"}
pitfalls=${input.pitfalls.join(" | ") || "none"}
axioms=${input.axioms || "none"}
summary=${input.summary || "none"}
blueprint=
${input.blueprintPromptBlock}
existing=${input.existingJson}
ragContext=${input.ragContext || "none"}`,
    ),
  ],
  postValidate: (output, input) => sanitizeLooseWorldObject(
    output,
    input.targetFields,
    `world.layer.generate(${input.layerKey})`,
  ),
};

export const worldLayerLocalizationPrompt: PromptAsset<
  WorldLayerLocalizationPromptInput,
  z.infer<typeof worldLooseObjectSchema>
> = {
  id: "world.layer.localize",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldLooseObjectSchema,
  render: (input) => [
    new SystemMessage(
      `你是文本本地化助手。将输入 JSON 对象中所有字段值改写为简体中文：
- 保持字段名不变，不新增字段，不删除字段；
- 保留原设定语义与专有名词含义；
- 输出仅为 JSON 对象。`,
    ),
    new HumanMessage(
      `layer=${input.layerKey}
fields=${input.layerFields.join(",")}
input=${input.sourcePayloadJson}`,
    ),
  ],
  postValidate: (output, input) => sanitizeLooseWorldObject(
    output,
    input.layerFields,
    `world.layer.localize(${input.layerKey})`,
  ),
};

export const worldImportExtractionPrompt: PromptAsset<
  WorldImportExtractionPromptInput,
  z.infer<typeof worldImportExtractionSchema>
> = {
  id: "world.import.extract",
  version: "v1",
  taskType: "fact_extraction",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldImportExtractionSchema,
  render: (input) => [
    new SystemMessage(
      `Extract world JSON with fields:
name, description, worldType, background, geography, magicSystem,
politics, cultures, races, religions, technology, history, economy, conflicts, factions, templateKey, axioms.
Output JSON only.`,
    ),
    new HumanMessage(input.content),
  ],
};

export const worldStructureBackfillPrompt: PromptAsset<
  WorldStructureBackfillPromptInput,
  z.infer<typeof worldStructuredDataSchema>
> = {
  id: "world.structure.backfill",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldStructuredDataSchema,
  render: (input) => [
    new SystemMessage(`你是世界结构化提取器。请根据输入文本提取世界结构，并且只能输出 JSON 对象。
JSON 结构必须为：
{
  "profile": {"summary":"...","identity":"...","tone":"...","themes":["..."],"coreConflict":"..."},
  "rules": {"summary":"...","axioms":[{"id":"rule-1","name":"...","summary":"...","cost":"...","boundary":"...","enforcement":"..."}],"taboo":["..."],"sharedConsequences":["..."]},
  "factions": [{"id":"faction-1","name":"...","position":"...","doctrine":"...","goals":["..."],"methods":["..."],"representativeForceIds":["force-1"]}],
  "forces": [{"id":"force-1","name":"...","type":"...","factionId":"faction-1","summary":"...","baseOfPower":"...","currentObjective":"...","pressure":"...","leader":"...","narrativeRole":"..."}],
  "locations": [{"id":"location-1","name":"...","terrain":"...","summary":"...","narrativeFunction":"...","risk":"...","entryConstraint":"...","exitCost":"...","controllingForceIds":["force-1"]}],
  "relations": {
    "forceRelations": [{"id":"force-relation-1","sourceForceId":"force-1","targetForceId":"force-2","relation":"...","tension":"...","detail":"..."}],
    "locationControls": [{"id":"location-control-1","forceId":"force-1","locationId":"location-1","relation":"...","detail":"..."}]
  }
}
要求：
1. 只能提取文本里明确存在或强可推断的信息。
2. 所有值必须使用简体中文。
3. faction 是抽象阵营、立场或路线；force 是具体组织、圈层、公司、部门或网络。
4. 像“社会压力机制”“行业运作规则”“人际法则”这类世界默认机制必须提取到 rules，不要写进 factions / forces。
5. 不要输出解释，不要输出 Markdown，不要增加额外字段。`),
    new HumanMessage(input.promptSource),
  ],
};

export const worldStructureSectionPrompt: PromptAsset<
  WorldStructureSectionPromptInput,
  z.infer<typeof worldStructureSectionOutputSchema>
> = {
  id: "world.structure.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldStructureSectionOutputSchema,
  render: (input) => [
    new SystemMessage(
      `你是世界结构化补全器。请只补全 section=${input.section} 对应的 JSON，不能输出解释。
${buildStructureSectionInstructions(input.section)}
要求：
1. 不要破坏已有 ID；如果沿用现有实体，请复用当前结构中的 id。
2. 不要编造与现有文本明显冲突的信息。
3. 阵营与势力区块必须同时考虑 factions 和 forces。
4. 如果 section=factions，禁止把社会压力机制、行业规则、人际法则这类世界默认机制写进 factions / forces，它们应属于 rules。
5. 地点区块必须填写 narrativeFunction、risk、entryConstraint、exitCost。
6. 关系区块只允许 forceRelations 和 locationControls。`,
    ),
    new HumanMessage(
      [
        input.promptSource,
        "当前结构：",
        JSON.stringify(input.currentStructure, null, 2),
        "当前绑定建议：",
        JSON.stringify(input.currentBindingSupport, null, 2),
      ].join("\n\n"),
    ),
  ],
  postValidate: (output, input) => normalizeWorldStructureSectionPayload(output, input),
};

export const worldAxiomSuggestionPrompt: PromptAsset<
  WorldAxiomSuggestionPromptInput,
  z.infer<typeof worldAxiomSuggestionSchema>
> = {
  id: "world.axioms.suggest",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: worldAxiomSuggestionSchema,
  render: (input) => [
    new SystemMessage(`请生成 5 条世界核心公理。
返回 JSON 数组，数组元素必须是字符串，全部使用简体中文。
要求：
1. 公理必须能约束后续世界生成，而不是空泛口号。
2. 公理要能覆盖代价、秩序、冲突来源、边界条件等关键约束。
3. 只输出 JSON 数组，不要输出解释。`),
    new HumanMessage(`世界名=${input.worldName}
世界类型=${input.worldType}
模板=${input.templateName}
模板说明=${input.templateDescription}
世界摘要=${input.description}
蓝图约束：
${input.blueprintPromptBlock}`),
  ],
};
