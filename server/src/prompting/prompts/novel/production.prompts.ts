/*
 * @LastEditors: biz
 */
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

export interface NovelProductionCharactersPromptInput {
  desiredCount: number;
  title: string;
  description: string;
  genre: string;
  narrativePov: string;
  styleTone: string;
  worldContext: string;
}

export const novelProductionCharacterSchema = z.array(z.object({
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  personality: z.string().trim().optional(),
  background: z.string().trim().optional(),
  development: z.string().trim().optional(),
  currentState: z.string().trim().optional(),
  currentGoal: z.string().trim().optional(),
})).min(1);

export const novelProductionCharactersPrompt: PromptAsset<
  NovelProductionCharactersPromptInput,
  z.infer<typeof novelProductionCharacterSchema>
> = {
  id: "novel.production.characters",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: novelProductionCharacterSchema,
  render: (input) => [
    new SystemMessage([
      "你是长篇中文小说的核心角色设计师。",
      `你的任务是为这部小说生成精确 ${input.desiredCount} 个核心角色，用于直接进入后续创作与生产流程。`,
      "",
      "只返回一个合法 JSON 数组，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "",
      "结构规则：",
      `1. 必须精确输出 ${input.desiredCount} 个角色，不可多于或少于该数量。`,
      "2. 数组中的每个对象只能且必须包含以下字段：name, role, personality, background, development, currentState, currentGoal。",
      "3. 不得新增字段，不得删除字段，不得改字段名。",
      "",
      "全局硬规则：",
      "1. 所有字段值必须使用简体中文。",
      "2. 角色必须基于给定的小说标题、简介、题材、叙事视角、风格基调和世界观生成，不得脱离这些信息随意发散。",
      "3. 这是“核心角色”设计，不要生成纯路人、工具人或只负责一次性出场的角色。",
      "4. 每个角色都必须对主线、主要冲突、关系张力或核心卖点有明确作用。",
      "5. 角色之间必须能形成可写的角色系统，而不是几张互不相干的人物卡。",
      "",
      "角色设计规则：",
      "1. name：应像真实可用的小说角色名，有辨识度，不要占位词或泛化称呼。",
      "2. role：写清角色在故事中的叙事功能与定位，不要只写职业或身份标签。",
      "3. personality：必须具体，体现角色的核心性格、外显特征与行为倾向，避免“性格复杂”“人物鲜明”这类空话。",
      "4. background：写清角色的出身、经历或所处位置中最影响当前故事的部分，不要扩写成整篇小传。",
      "5. development：必须体现角色的成长路径、变化方向或可能的阶段性转变，不能只是重复 personality。",
      "6. currentState：必须说明角色当前正处在什么处境、关系位置、心理状态或局势中，要可直接用于开写。",
      "7. currentGoal：必须写角色眼下最直接的目标，而不是泛泛的人生理想。",
      "",
      "阵容规则：",
      "1. 生成的角色整体上应覆盖主角推动、对立压力、关系牵引、辅助支撑、价值镜像或世界侧功能等关键位置。",
      "2. 不要让多个角色承担完全重复的功能，避免阵容同质化。",
      "3. 若题材、视角或基调天然限制角色数量或类型，也要在限制内做最合理的核心配置。",
      "4. 角色设计必须服务于长篇推进，而不是只服务开篇。",
      "",
      "风格要求：",
      "1. 表达要具体、清楚、可直接进入创作流程。",
      "2. 不要使用空泛套话，如“很有魅力”“设定完整”“成长明显”。",
      "3. 各字段之间必须一致，不得互相冲突。",
      "",
      "缺口处理规则：",
      "1. 如果输入信息不足，可以做低风险、贴合题材和基调的合理补全。",
      "2. 不要捏造过于具体但无依据的复杂世界规则或大段历史细节。",
    ].join("\n")),
    new HumanMessage([
      `小说标题：${input.title}`,
      `小说简介：${input.description}`,
      `题材：${input.genre}`,
      `叙事视角：${input.narrativePov}`,
      `风格基调：${input.styleTone}`,
      `世界观：${input.worldContext}`,
    ].join("\n\n")),
  ],
};