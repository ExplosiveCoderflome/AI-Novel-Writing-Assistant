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
    "description：用 2-4 句中文概括这个世界最核心的运行方式与阅读感受",
    "background：说明世界起点、当前时代和开局处境",
    "conflicts：说明当前世界最主要的结构性冲突",
  ];

  if (input.dimensions.geography) {
    requirements.push("geography：地形、气候、区域分布、关键地点与地理风险");
  }
  if (input.dimensions.culture) {
    requirements.push("cultures：社会风貌、习俗与价值观");
    requirements.push("politics：权力结构、统治方式与主要立场");
    requirements.push("races：主要族群、圈层或身份分化");
    requirements.push("religions：宗教、信仰或替代性精神秩序");
    requirements.push("factions：主要势力、组织或阵营格局");
  }
  if (input.dimensions.magicSystem) {
    requirements.push("magicSystem：力量来源、使用方式、限制条件与代价");
  }
  if (input.dimensions.technology) {
    requirements.push("technology：技术水平、代表性技术与社会影响");
    requirements.push("economy：资源、产业或财富流动方式");
  }
  if (input.dimensions.history) {
    requirements.push("history：世界起源、关键历史节点与当前时代成因");
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
        "你的任务是把用户给出的世界灵感，整理成可直接进入后续细化阶段的世界草稿。",
        "只输出一个 JSON 对象，不要输出 Markdown、解释、注释或额外文本。",
        "允许使用的字段只有：description, background, geography, cultures, magicSystem, politics, races, religions, technology, conflicts, history, economy, factions, overviewSummary。",
        "所有字段值必须使用简体中文。",
        "不要空泛抒情，要写能直接支撑小说创作的设定。",
        "如果某个字段信息不足，可以省略该字段；但必须优先完成用户明确要求细化的字段。",
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
      "请在保持世界一致性的前提下，改写并增强指定字段的文本。",
      "不要改变世界核心事实、因果关系和已知约束。",
      input.refinementLevel === "deep"
        ? "这次需要深度增强：补足信息密度、逻辑关联与可写性。"
        : "这次需要轻量增强：主要做表达优化、细节补强和清晰化。",
      "只输出改写后的正文，不要解释修改原因。",
    ].join("\n")),
    new HumanMessage([
      `世界名称：${input.worldName}`,
      `目标字段：${input.attribute}`,
      "",
      "当前内容：",
      input.currentValue,
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
      "你是世界观改写选项生成器。",
      "请基于当前字段内容生成多个互斥的优化方向，供用户挑选。",
      "只输出 JSON 数组，不要输出解释、Markdown 或额外文本。",
      "数组元素结构固定为：{\"title\":\"...\",\"content\":\"...\"}。",
      "title 要概括这一版的方向差异，content 要给出完整改写结果。",
      "不同选项必须体现明显方向差异，不要只做同义改写。",
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
