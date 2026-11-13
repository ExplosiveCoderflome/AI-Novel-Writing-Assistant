import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { outlineFeedbackOutputSchema, type OutlineFeedbackOutput } from "@ai-novel/shared/types/outlineFeedback";
import type { PromptAsset } from "../../core/promptTypes";

export interface OutlineFeedbackPromptInput {
  summary: string;
  chapterOrder: number;
  nodes: Array<{ nodeId: string; type: string; fields: Record<string, string> }>;
}
export const outlineFeedbackPrompt: PromptAsset<OutlineFeedbackPromptInput, OutlineFeedbackOutput> = {
  id: "outline.text_feedback", version: "v1", taskType: "planner", mode: "structured", language: "zh",
  contextPolicy: { maxTokensBudget: 7000 }, outputSchema: outlineFeedbackOutputSchema,
  management: { productPrompt: true, editModes: ["readonly"] },
  render: input => [new SystemMessage("根据已完成章节的摘要，对相关工作大纲提出待用户逐项确认的调整。摘要是实际结果，大纲是未来计划。仅调整输入 nodes 中提供的字段与节点，保留节点身份、章序和关联，不增加字段；无需调整时返回空 operations。关注人物弧线、伏笔兑现、后续钩子与后续章节任务，保持后续章节相互连贯。每项操作独立，不得依赖其他操作。理由用中文说明用户可理解的创作影响。不要重写已完成章或当前章，不要要求正文，不将未来计划当成已发生事实。"), new HumanMessage(JSON.stringify(input))],
};
