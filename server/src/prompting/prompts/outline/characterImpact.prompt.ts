import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { impactDialogueReviewSchema, impactReviewSchema, type ImpactReview, type ImpactRole, type ImpactSnapshot } from "@ai-novel/shared/types/outlineCharacterImpact";
import type { PromptAsset } from "../../core/promptTypes";

export interface CharacterImpactPromptInput {
  snapshot: ImpactSnapshot;
  requestText: string;
  role: ImpactRole;
  prior: Partial<Record<ImpactRole, ImpactReview>>;
  conversationHistory?: { author: string; assistant: string | null }[];
  previousProposal?: {requestText: string | null; operations: unknown[]; retained: unknown[]; baseVersion?: number; status?: string; appliedOperationIds?: string[]};
  // Present only on a retry after this role's previous suggestions were all
  // skipped as out of scope. Restates the role's allowed scope so the model
  // can stay inside it on the second attempt.
  scopeRetryHint?: string;
}
export const impactScopeRetryHints: Record<ImpactRole, string> = {
  character: "你只能修改选中人物本人的 role、goal、motivation、conflict、secret、arcDirection。",
  plot: "你只能修改卷的 summary、promise、pressure、protagonistChange、climax、endingHook，或章的 summary、purpose、conflict、emotionalBeat、endingHook。",
  payoff: "你只能修改伏笔节点的 setupDescription、payoffDescription，或章的 endingHook。",
};
const assignments: Record<ImpactRole, string> = {
  character: "审阅选中人物的动机与转折，只可修改该人物的 role、goal、motivation、conflict、secret、arcDirection。指出有理由保留的原有选择。",
  plot: "依据人物审阅，检查相关卷和章的行动因果。卷可改 summary、promise、pressure、protagonistChange、climax、endingHook；章可改 summary、purpose、conflict、emotionalBeat、endingHook。解释哪些关键行动仍应保留。",
  payoff: "结合前两份审阅，核对读者何时得到线索、何时能够确定真相。伏笔可改 setupDescription、payoffDescription，也可补充章的 endingHook。沿用已经提出的字段值，避免给同一字段提出矛盾改法。",
};
const asset = {
  id: "outline.character_impact", taskType: "planner", mode: "structured", language: "zh", contextPolicy: {maxTokensBudget: 8000},
} as const;
export const characterImpactPrompt: PromptAsset<CharacterImpactPromptInput, ImpactReview> = {
  ...asset, version: "v1", outputSchema: impactReviewSchema,
  render: input => renderImpact(input),
};
function renderImpact(input: CharacterImpactPromptInput, dialogue = false) {
  return [
    new SystemMessage([
      "你为作者审阅独立大纲中的一次人物调整。三位审阅者使用同一份已保存的大纲。", assignments[input.role],
      ...(input.scopeRetryHint ? [`上一轮的部分建议超出了你可改的范围、已被跳过。请只在以下范围内重新提修改：${input.scopeRetryHint}`] : []),
      "recentCharacterChanges 是刚保存的人物字段差异。以保存后的值为基线，结合作者本次要求、显式引用与剧情文字判断相关卷章和伏笔。保护固定设定、已写章节和作者要求保留的情节。优先在后续未写章节安排线索。不要改名、增删、移动节点或重写正文。",
      "每项 changes 给出 nodeId、field、完整新值 value、中文理由 reason、前置修改节点 dependsOnNodeIds 和 risks。只用文档真实 ID；仅当本项单独采纳会破坏因果时引用一项实际提出的修改，不引用自己。",
      "retained 说明关键节点为何值得保留；如已写章节需要作者另行决定，也记在这里。只报与本次请求有关的项目。没有合适修改时可返回空数组。用户可见的说明使用书中人物、卷章名称。",
      ...(dialogue ? ["参考 conversationHistory 和上一版提案，延续仍适用的约束。本轮只询问原因、比较选择或要求先讨论时，responseKind 返回 explanation，并用 replyText 直接回答。作者要求修改时返回 proposal，给出完整可独立审阅的建议。replyText 用中文直接向作者解释结果、取舍和保留的情节，不声称已经改稿。最后的伏笔审阅者综合三方结果形成对作者的回复。"] : []),
      dialogue
        ? "previousProposal 是作者正在讨论的方案。若来源版本或状态有变化，参考既往取舍和已采纳项，重新核对当前快照。只提出仍有必要的修改。"
        : "如附有 previousProposal，它是尚未采纳的旧建议。用作者的反馈修订整套建议，每项仍须与当前已保存的大纲对比。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input)),
  ];
}

export const characterDialoguePrompt: PromptAsset<CharacterImpactPromptInput, ImpactReview & { replyText: string; responseKind: "explanation" | "proposal" }> = {
  ...asset, version: "v2", outputSchema: impactDialogueReviewSchema, render: input => renderImpact(input, true),
};
