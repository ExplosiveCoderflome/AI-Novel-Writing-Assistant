import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { impactReviewSchema, type ImpactReview, type ImpactRole, type ImpactSnapshot } from "@ai-novel/shared/types/outlineCharacterImpact";
import type { PromptAsset } from "../../core/promptTypes";

export interface CharacterImpactPromptInput {
  snapshot: ImpactSnapshot;
  requestText: string;
  role: ImpactRole;
  prior: Partial<Record<ImpactRole, ImpactReview>>;
  previousProposal?: {requestText: string | null; operations: unknown[]; retained: unknown[]};
}
const assignments: Record<ImpactRole, string> = {
  character: "审阅选中人物的动机与转折，只可修改该人物的 role、goal、motivation、conflict、secret、arcDirection。指出有理由保留的原有选择。",
  plot: "依据人物审阅，检查相关卷和章的行动因果。卷可改 summary、promise、pressure、protagonistChange、climax、endingHook；章可改 summary、purpose、conflict、emotionalBeat、endingHook。解释哪些关键行动仍应保留。",
  payoff: "结合前两份审阅，核对读者何时得到线索、何时能够确定真相。伏笔可改 setupDescription、payoffDescription，也可补充章的 endingHook。沿用已经提出的字段值，避免给同一字段提出矛盾改法。",
};
export const characterImpactPrompt: PromptAsset<CharacterImpactPromptInput, ImpactReview> = {
  id: "outline.character_impact", version: "v1", taskType: "planner", mode: "structured", language: "zh",
  contextPolicy: {maxTokensBudget: 8000}, outputSchema: impactReviewSchema,
  render: input => [
    new SystemMessage([
      "你为作者审阅独立大纲中的一次人物调整。三位审阅者使用同一份已保存的大纲。", assignments[input.role],
      "recentCharacterChanges 是刚保存的人物字段差异。以保存后的值为基线，结合作者本次要求、显式引用与剧情文字判断相关卷章和伏笔。保护固定设定、已写章节和作者要求保留的情节。优先在后续未写章节安排线索。不要改名、增删、移动节点或重写正文。",
      "每项 changes 给出 nodeId、field、完整新值 value、中文理由 reason、前置修改节点 dependsOnNodeIds 和 risks。只用文档真实 ID；仅当本项单独采纳会破坏因果时引用一项实际提出的修改，不引用自己。",
      "retained 说明关键节点为何值得保留；如已写章节需要作者另行决定，也记在这里。只报与本次请求有关的项目。没有合适修改时可返回空数组。用户可见的说明使用书中人物、卷章名称。",
      "如附有 previousProposal，它是尚未采纳的旧建议。用作者的反馈修订整套建议，每项仍须与当前已保存的大纲对比。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input)),
  ],
};
