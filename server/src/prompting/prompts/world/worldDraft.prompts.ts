import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import type { WorldGenerateInput, WorldTextField } from "../../../services/world/worldServiceShared";

const worldDraftFieldSchema = z.string().trim().min(1).optional().nullable();

export const worldDraftGenerationSchema = z.object({
  description: worldDraftFieldSchema,
  background: worldDraftFieldSchema,
  geography: worldDraftFieldSchema,
  cultures: worldDraftFieldSchema,
  magicSystem: worldDraftFieldSchema,
  politics: worldDraftFieldSchema,
  races: worldDraftFieldSchema,
  religions: worldDraftFieldSchema,
  technology: worldDraftFieldSchema,
  conflicts: worldDraftFieldSchema,
  history: worldDraftFieldSchema,
  economy: worldDraftFieldSchema,
  factions: worldDraftFieldSchema,
  overviewSummary: worldDraftFieldSchema,
}).strict();

export const worldRefineAlternativeSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
}).strict();

export const worldRefineAlternativeListSchema = z.array(worldRefineAlternativeSchema).min(1).max(3);

export interface WorldDraftGenerationPromptInput extends Pick<
  WorldGenerateInput,
  "name" | "description" | "worldType" | "complexity" | "dimensions"
> {}

export interface WorldDraftRefinePromptInput {
  worldName: string;
  attribute: WorldTextField;
  refinementLevel: "light" | "deep";
  currentValue: string;
}

export interface WorldDraftRefineAlternativesPromptInput extends WorldDraftRefinePromptInput {
  count: number;
}

function buildWorldDraftRequirements(input: WorldDraftGenerationPromptInput): string[] {
  const requirements: string[] = [
    "description：用 2-4 句概括世界运行逻辑 + 阅读感受，必须体现“这个世界怎么运作 + 读者体验是什么”，禁止空话",
    "background：明确世界起点、时代阶段与当前开局处境，必须能支撑剧情起步",
    "conflicts：提炼世界层的结构性冲突（长期存在的矛盾），不是单一事件",
  ];

  if (input.dimensions.geography) {
    requirements.push("geography：地形结构、区域分布与关键地点，必须体现“空间如何影响冲突与行动”");
  }

  if (input.dimensions.culture) {
    requirements.push("cultures：社会风貌与价值观，必须能解释人物行为与选择逻辑");
    requirements.push("politics：权力结构与统治方式，必须体现控制与对抗关系");
    requirements.push("races：族群或阶层划分，必须体现差异与资源分配");
    requirements.push("religions：信仰或精神秩序，必须体现约束或影响行为的机制");
    requirements.push("factions：主要势力与阵营格局，必须可用于构建冲突与联盟");
  }

  if (input.dimensions.magicSystem) {
    requirements.push("magicSystem：力量来源、使用方式、限制与代价，必须体现“获得能力的成本与边界”");
  }

  if (input.dimensions.technology) {
    requirements.push("technology：技术水平与关键技术，必须说明其如何改变社会结构");
    requirements.push("economy：资源与财富流动方式，必须体现生存压力或竞争机制");
  }

  if (input.dimensions.history) {
    requirements.push("history：关键历史节点与转折，必须解释当前世界为何会变成现在这样");
  }

  return requirements;
}

export const worldDraftGenerationPrompt: PromptAsset<
  WorldDraftGenerationPromptInput,
  z.infer<typeof worldDraftGenerationSchema>
> = {
  id: "world.draft.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  semanticRetryPolicy: {
    maxAttempts: 1,
  },
  outputSchema: worldDraftGenerationSchema,
  render: (input) => {
    const requirements = buildWorldDraftRequirements(input);

    return [
      new SystemMessage([
        "你是长篇小说世界观生成助手，服务对象是不懂世界构建的新手作者。",
        "你的任务是把用户给出的世界灵感，整理成一份可直接进入后续细化阶段的“世界草稿 JSON”。",
        "这不是散文式世界介绍，也不是空泛概念展示，而是能直接支撑小说创作的设定底稿。",
        "",
        "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
        "",
        "允许使用的字段只有：",
        "description, background, geography, cultures, magicSystem, politics, races, religions, technology, conflicts, history, economy, factions, overviewSummary。",
        "不得新增字段，不得改字段名，不得输出字段外内容。",
        "",
        "全局硬规则：",
        "1. 所有字段值必须使用简体中文。",
        "2. 只能基于用户给出的世界名称、世界类型、复杂度和需求描述生成，不得脱离输入另起一套世界。",
        "3. 必须优先完成本次要求细化的字段。",
        "4. 不要空泛抒情，不要写百科腔，不要写“很复杂”“很宏大”“充满张力”这类空话。",
        "5. 每个字段都要尽量回答“这个世界具体怎么运作、怎么影响人物、怎么支撑剧情”。",
        "6. 如果某个字段信息不足，可以省略，但不要因为保守而省略本次明确要求优先补全的字段。",
        "7. 各字段之间必须自洽，不得出现世界规则、历史、势力、文化互相打架的情况。",
        "",
        "生成原则：",
        "1. 世界草稿必须服务小说创作，而不是只提供设定观赏性。",
        "2. 优先生成会影响剧情推进、人物选择、资源竞争、秩序运行和冲突来源的硬设定。",
        "3. 不要把具体剧情桥段、人物个人动机或感情推进写成世界设定。",
        "4. 如果是高复杂度世界，可以适度增加层次；如果是低复杂度世界，应优先清楚、稳定、好写，而不是强行铺大。",
        "",
        "字段要求：",
        "1. description：用2-4句概括这个世界最核心的运行方式与阅读感受，必须体现“这个世界怎么运作 + 读者会感受到什么”。",
        "2. background：说明世界起点、当前时代与开局处境，必须能支撑故事从哪里开始。",
        "3. conflicts：提炼当前世界最主要的结构性冲突，必须是长期矛盾，不是单一事件。",
        "4. geography：若生成，必须体现地形结构、区域分布与关键地点如何影响冲突、流动和行动。",
        "5. cultures：若生成，必须体现社会风貌、习俗和价值观如何塑造行为方式。",
        "6. politics：若生成，必须体现权力结构、统治方式与主要立场如何制造控制与对抗。",
        "7. races：若生成，必须体现主要族群、圈层或身份分化，不要只列名称。",
        "8. religions：若生成，必须体现宗教、信仰或替代性精神秩序对社会的实际约束。",
        "9. magicSystem：若生成，必须说明力量来源、使用方式、限制条件与代价，尤其要体现边界。",
        "10. technology：若生成，必须说明技术水平、关键技术及其如何改变社会结构。",
        "11. economy：若生成，必须说明资源、产业或财富如何流动，并体现生存压力或竞争机制。",
        "12. history：若生成，必须说明关键历史节点与当前时代成因，解释世界为何会变成现在这样。",
        "13. factions：若生成，必须体现主要势力、组织或阵营格局，以及它们如何参与世界冲突。",
        "14. overviewSummary：若生成，应作为整份世界草稿的压缩概括，便于后续系统快速读取，但不能与 description 机械重复。",
        "",
        "质量要求：",
        "1. 输出应像可直接进入下一步细化的世界底稿，而不是灵感随笔。",
        "2. 每个字段都尽量具体到能写故事，而不是停留在抽象概念。",
        "3. 优先保留真正重要的分歧点、压力源和规则边界，不要被零碎细节拖散。",
      ].join("\n")),
      new HumanMessage([
        `世界名称：${input.name}`,
        `世界类型：${input.worldType}`,
        `复杂度：${input.complexity}`,
        "",
        "用户需求：",
        input.description,
        "",
        "本次必须优先补全的字段：",
        ...requirements.map((item, index) => `${index + 1}. ${item}`),
      ].join("\n")),
    ];
  },
  postValidate: (output, input) => {
    const requiredFields = ["description", "background", "conflicts"] as const;

    for (const field of requiredFields) {
      if (!output[field]?.trim()) {
        throw new Error(`世界草稿生成结果缺少 ${field}。`);
      }
    }

    if (input.dimensions.geography && !output.geography?.trim()) {
      throw new Error("世界草稿生成结果缺少 geography。");
    }

    if (input.dimensions.magicSystem && !output.magicSystem?.trim()) {
      throw new Error("世界草稿生成结果缺少 magicSystem。");
    }

    if (input.dimensions.technology && !output.technology?.trim()) {
      throw new Error("世界草稿生成结果缺少 technology。");
    }

    if (input.dimensions.history && !output.history?.trim()) {
      throw new Error("世界草稿生成结果缺少 history。");
    }

    if (input.dimensions.culture) {
      const cultureFields = [
        output.cultures,
        output.politics,
        output.races,
        output.religions,
        output.factions,
      ].filter((value) => value?.trim());

      if (cultureFields.length < 3) {
        throw new Error("世界草稿生成结果缺少足够的 culture 相关字段。");
      }
    }

    return output;
  },
};

export const worldDraftRefinePrompt: PromptAsset<WorldDraftRefinePromptInput, string, string> = {
  id: "world.draft.refine",
  version: "v1",
  taskType: "repair",
  mode: "text",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  render: (input) => [
    new SystemMessage([
      "你是世界观润色编辑。",
      "你的任务是针对指定世界字段进行定点改写与增强，让它更清晰、更具体、更适合小说创作使用。",
      "",
      "只输出改写后的最终正文，不要输出 Markdown、解释、注释、修改说明、代码块或额外文本。",
      "",
      "全局硬规则：",
      "1. 只能改写目标字段内容，不要扩展到其他字段。",
      "2. 必须保持世界核心事实、因果关系、结构逻辑和已知约束不变。",
      "3. 不得引入与原内容冲突的新设定、新规则、新历史结论或新势力关系。",
      "4. 若原内容信息不足，可以做低风险补强，但必须贴合当前字段职责，不能借机另起一套设定。",
      "",
      input.refinementLevel === "deep"
        ? [
            "当前增强强度：deep（深度增强）。",
            "要求：",
            "1. 在不改变核心设定的前提下，明显提升信息密度、逻辑关联和写作可用性。",
            "2. 优先补足“这个设定如何运作、如何约束人物、如何支撑冲突”的关键缺口。",
            "3. 允许做较大幅度重写，但必须保留原字段核心语义与方向。",
          ].join("\n")
        : [
            "当前增强强度：light（轻量增强）。",
            "要求：",
            "1. 以表达优化、细节补强和清晰化为主。",
            "2. 尽量保持原内容结构与主表达方向，不做无必要的大改。",
            "3. 优先修正生硬、模糊、空泛和重复的问题。",
          ].join("\n"),
      "",
      "改写目标：",
      "1. 让文本更像可直接进入世界设定稿的成稿，而不是草记或灵感句。",
      "2. 让内容更具体，避免“世界很复杂”“冲突很多”“文化多样”这类空话。",
      "3. 让该字段更能服务小说创作，体现它如何影响剧情、人物、生存、秩序或冲突。",
      "4. 若目标字段天然需要结构关系，应补出因果或功能关联，而不是孤立描述。",
      "",
      "表达要求：",
      "1. 全文使用简体中文。",
      "2. 只输出一段可直接替换当前字段的文本。",
      "3. 不要写列表、不要分点、不要加标题。",
      "4. 语言要稳、准、清楚，避免百科腔、说明书腔和空泛抒情。",
      "",
      "自检要求：",
      "1. 是否仍然保持与原字段的核心事实一致。",
      "2. 是否增强了可写性，而不是只换同义词。",
      "3. 是否没有越界生成其他字段内容。",
      "4. 是否只输出改写后的正文。",
    ].join("\n")),
    new HumanMessage([
      `世界名称：${input.worldName}`,
      `目标字段：${input.attribute}`,
      "",
      "当前内容：",
      input.currentValue,
      "",
      "请直接输出该字段的增强改写版本。",
    ].join("\n")),
  ],
};

export const worldDraftRefineAlternativesPrompt: PromptAsset<
  WorldDraftRefineAlternativesPromptInput,
  z.infer<typeof worldRefineAlternativeListSchema>
> = {
  id: "world.draft.refine_alternatives",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  semanticRetryPolicy: {
    maxAttempts: 1,
  },
  outputSchema: worldRefineAlternativeListSchema,
  render: (input) => [
    new SystemMessage([
      "你是世界观字段改写候选生成器。",
      "你的任务是：基于用户当前字段内容，生成多个可直接替换原文的候选版本，供用户挑选。",
      "",
      "硬性要求：",
      "1. 只输出 JSON 数组，不要输出解释、Markdown、代码块或任何额外文本。",
      "2. 数组元素结构固定为：{\"title\":\"...\",\"content\":\"...\"}。",
      "3. 必须严格输出指定数量的候选。",
      "4. 每个 content 都必须是该字段的一份完整可用改写稿，而不是提纲、点评、备注或半成品。",
      "5. 不同候选必须体现明确且可感知的方向差异，不能只是语序调整、同义替换或轻微润色。",
      "6. 所有候选都必须保留原内容的核心事实、既有设定、因果关系与关键约束，不得凭空新增会改变世界设定走向的重要事实。",
      "",
      "候选差异应优先体现在以下维度之一或其组合：",
      " - 表达气质不同：冷峻、史诗、凝练、厚重、神秘、纪实、传奇感",
      " - 信息组织不同：先总后分、先规则后现象、先背景后核心矛盾",
      " - 强调重点不同：设定逻辑、冲突张力、历史沉淀、运行机制、叙事可写性",
      " - 细化方式不同：轻量提纯、结构重组、深度增强",
      "",
      "title 要简洁概括该版本的改写方向，能够让用户一眼看出它与其他版本的区别。",
      "content 要直接输出改写后的完整正文，不要出现“版本一”“改写如下”“说明”等字样。",
      "",
      "如果原文信息较少，不要胡乱扩写，应在保留原意的前提下，通过重组表达、补强逻辑衔接和提升可读性来拉开候选差异。",
    ].join("\n")),
    new HumanMessage([
      `世界名称：${input.worldName}`,
      `目标字段：${input.attribute}`,
      `细化深度：${input.refinementLevel}`,
      `候选数量：${input.count}`,
      "",
      "当前内容：",
      input.currentValue,
    ].join("\n")),
  ],
  postValidate: (output, input) => {
    if (output.length !== input.count) {
      throw new Error(`世界润色候选数量不符合要求，期望 ${input.count} 个，实际 ${output.length} 个。`);
    }
    return output;
  },
};
