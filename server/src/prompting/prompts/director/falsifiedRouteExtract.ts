import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../core/promptTypes";
import { z } from "zod";

export const falsifiedRouteExtractOutputSchema = z.object({
  rootCauseCode: z.string(),
  failedPlanSummary: z.string(),
  rejectionReason: z.string(),
  negativePromptConstraint: z.string(),
});

export type FalsifiedRouteExtractOutput = z.infer<typeof falsifiedRouteExtractOutputSchema>;

export interface FalsifiedRouteExtractPromptInput {
  failedDraftOrOutline: string;
  auditFeedback: string;
}

export const falsifiedRouteExtractPromptAsset: PromptAsset<FalsifiedRouteExtractPromptInput, FalsifiedRouteExtractOutput> = {
  id: "director.falsified_route.extract",
  version: "1.0.0",
  taskType: "fact_extraction",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 4000,
  },
  outputSchema: falsifiedRouteExtractOutputSchema,
  render: (input) => {
    const system = new SystemMessage(
      `你是 GA-Argus 自动导演系统的死枝（Falsified Route）提取专家。\n` +
      `你的职责是从打回或失败的情节方案中，提炼出不可再次重复踩坑的结构化负向约束 (Negative Constraint)。\n\n` +
      `输出要求:\n` +
      `1. rootCauseCode: 必须用全大写下划线命名 (例: CHARACTER_OOC, TIMELINE_PARADOX, PAYOFF_MISSED).\n` +
      `2. negativePromptConstraint: 提炼成一句话明确的禁忌指令 (例: "严禁安排主角向敌人求饶")。`
    );

    const user = new HumanMessage(
      `[打回/失败的情节方案草稿]:\n${input.failedDraftOrOutline}\n\n` +
      `[审查打回意见]:\n${input.auditFeedback}\n\n` +
      `请提炼结构化负向约束。`
    );

    return [system, user];
  },
};
