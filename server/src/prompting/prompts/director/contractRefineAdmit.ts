import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../core/promptTypes";
import { z } from "zod";

export const contractRefineAdmitOutputSchema = z.object({
  admitted: z.boolean(),
  reason: z.string(),
  refinedOperationalObjective: z.object({
    dramaticGoal: z.string(),
    pacingTarget: z.enum(["fast", "normal", "climax_slow"]),
  }),
});

export type ContractRefineAdmitOutput = z.infer<typeof contractRefineAdmitOutputSchema>;

export interface ContractRefineAdmitPromptInput {
  standingIntent: string;
  currentObjective: string;
  proposedObjective: string;
  evidenceSummary: string;
}

export const contractRefineAdmitPromptAsset: PromptAsset<ContractRefineAdmitPromptInput, ContractRefineAdmitOutput> = {
  id: "director.contract.refine_admit",
  version: "1.0.0",
  taskType: "replan",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 4000,
  },
  outputSchema: contractRefineAdmitOutputSchema,
  render: (input) => {
    const system = new SystemMessage(
      `你是 GA-Argus 自动导演系统的 ManagerAdmit 准入审查员。\n` +
      `你的职责是评估拟议的阶段目标调整 (Operational Objective) 是否在尊重核心立意 (Standing Intent) 的前提下，基于前序试验证据进行了合理的路线转向 (Verified Pivot)。\n\n` +
      `规则:\n` +
      `1. 如果拟议目标违背了核心立意或作者硬性避坑规则，必须拒绝 (admitted = false)。\n` +
      `2. 如果拟议目标在保持核心爽点与主题的前提下精细化了冲突或节奏，应当准入 (admitted = true)。`
    );

    const user = new HumanMessage(
      `[立项核心意图 (Standing Intent)]:\n${input.standingIntent}\n\n` +
      `[当前阶段目标 (Current Objective)]:\n${input.currentObjective}\n\n` +
      `[拟议阶段目标 (Proposed Objective)]:\n${input.proposedObjective}\n\n` +
      `[前序试验证据与错误摘要]:\n${input.evidenceSummary}\n\n` +
      `请做出结构化准入裁决。`
    );

    return [system, user];
  },
};
