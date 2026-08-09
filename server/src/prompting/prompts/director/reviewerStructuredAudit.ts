import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../core/promptTypes";
import { z } from "zod";

export const reviewerStructuredAuditOutputSchema = z.object({
  verdict: z.enum(["done", "continue", "defer_and_continue", "replan_required"]),
  rootCauseCode: z.string().optional(),
  patchInstructions: z.string().optional(),
  qualityDebtSummary: z.string().optional(),
  blockingObligations: z.array(z.string()).optional(),
});

export type ReviewerStructuredAuditOutput = z.infer<typeof reviewerStructuredAuditOutputSchema>;

export interface ReviewerStructuredAuditPromptInput {
  draftContent: string;
  contractConstraints: string;
  falsifiedRoutesContext: string;
}

export const reviewerStructuredAuditPromptAsset: PromptAsset<ReviewerStructuredAuditPromptInput, ReviewerStructuredAuditOutput> = {
  id: "director.reviewer.structured_audit",
  version: "1.0.0",
  taskType: "critical_review",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 5000,
  },
  outputSchema: reviewerStructuredAuditOutputSchema,
  render: (input) => {
    const system = new SystemMessage(
      `你是 GA-Argus 自动导演系统的独立 Reviewer（文风与逻辑审校官）。\n` +
      `你需要对照合同约束 (Working Contract) 与历史已否决死枝账本 (Falsified Routes)，做出四级结构化判定:\n\n` +
      `1. "done": 完全合格或仅微小瑕疵，直接放行。\n` +
      `2. "continue": 存在可修补局部缺陷，需生成精确 patchInstructions 引导第2轮修复。\n` +
      `3. "defer_and_continue": 非阻断性质量债务，记录 qualityDebtSummary 后放行，不卡死主流程。\n` +
      `4. "replan_required": 出现重大剧情冲突或设定碰撞，需触发 Manager 重规划/Pivot。`
    );

    const user = new HumanMessage(
      `[待审查正文/大纲草稿]:\n${input.draftContent}\n\n` +
      `[阶段合同约束 (Contract Constraints)]:\n${input.contractConstraints}\n\n` +
      `[历史避坑账本 (Falsified Routes)]:\n${input.falsifiedRoutesContext}\n\n` +
      `请做出四级结构化裁决。`
    );

    return [system, user];
  },
};
