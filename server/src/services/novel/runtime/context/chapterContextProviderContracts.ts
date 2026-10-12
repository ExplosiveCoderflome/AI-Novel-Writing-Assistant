import type { ContextBlockTier, ContextGatingDecision, GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";

export type ChapterContextProviderStage = "write" | "review" | "repair" | "preview";

export interface ChapterContextProviderContract {
  id: string;
  stages: readonly ChapterContextProviderStage[];
  inputDependencies: readonly string[];
  priority: number;
  tier: ContextBlockTier;
  required: boolean;
  tokenBudget: number;
  failureSemantics: "block" | "degrade" | "omit";
}

export const CHAPTER_CONTEXT_PROVIDER_CONTRACTS: readonly ChapterContextProviderContract[] = [
  { id: "character_hard_facts", stages: ["write", "review", "repair"], inputDependencies: ["characterRoster", "characterHardFacts"], priority: 120, tier: "hard_required", required: true, tokenBudget: 900, failureSemantics: "block" },
  { id: "previous_chapter_result", stages: ["write", "review", "repair"], inputDependencies: ["chapterOrder", "previousChapterTail", "previousChaptersSummary"], priority: 115, tier: "hard_required", required: true, tokenBudget: 700, failureSemantics: "block" },
  { id: "chapter_obligations", stages: ["write", "review", "repair"], inputDependencies: ["plan", "chapterMission"], priority: 125, tier: "hard_required", required: true, tokenBudget: 800, failureSemantics: "block" },
  { id: "world_context", stages: ["write", "review", "repair", "preview"], inputDependencies: ["novelId", "storyWorldSlice"], priority: 90, tier: "situational", required: false, tokenBudget: 700, failureSemantics: "degrade" },
  { id: "rag_context", stages: ["write", "review", "repair", "preview"], inputDependencies: ["chapterMission", "novelId"], priority: 60, tier: "optional", required: false, tokenBudget: 900, failureSemantics: "omit" },
] as const;

export function evaluateChapterContextProviderContracts(input: {
  stage: ChapterContextProviderStage;
  chapterOrder: number;
  contextPackage: Pick<GenerationContextPackage, "characterRoster" | "characterHardFacts" | "plan" | "chapterMission" | "previousChapterTail" | "previousChaptersSummary" | "storyWorldSlice" | "ragContext">;
}): ContextGatingDecision[] {
  const decisions: ContextGatingDecision[] = [];
  for (const contract of CHAPTER_CONTEXT_PROVIDER_CONTRACTS) {
    if (!contract.stages.includes(input.stage)) continue;
    let applicable = true;
    let available = true;
    let reason = "已提供";
    if (contract.id === "character_hard_facts") {
      applicable = input.contextPackage.characterRoster.length > 0;
      available = input.contextPackage.characterHardFacts.length > 0;
      reason = available ? "角色硬事实已提供" : "适用章节缺少角色硬事实";
    } else if (contract.id === "previous_chapter_result") {
      applicable = input.chapterOrder > 1;
      available = Boolean(input.contextPackage.previousChapterTail?.trim()) || input.contextPackage.previousChaptersSummary.length > 0;
      reason = available ? "上一章实际结果已提供" : "当前章节缺少上一章实际结果";
    } else if (contract.id === "chapter_obligations") {
      available = Boolean(input.contextPackage.plan) && Boolean(input.contextPackage.chapterMission);
      reason = available ? "章节义务已提供" : "章节规划或任务义务缺失";
    } else if (contract.id === "world_context") {
      available = Boolean(input.contextPackage.storyWorldSlice);
      reason = available ? "世界上下文已提供" : "没有可用世界切片，按降级语义继续";
    } else if (contract.id === "rag_context") {
      available = Boolean(input.contextPackage.ragContext?.trim());
      reason = available ? "知识库上下文已提供" : "知识库未返回匹配内容，按可选语义跳过";
    }
    if (applicable) decisions.push({ blockId: contract.id, tier: contract.tier, included: available, reason });
  }
  return decisions;
}

export function getBlockingChapterContextGaps(decisions: ContextGatingDecision[]): string[] {
  const required = new Set(CHAPTER_CONTEXT_PROVIDER_CONTRACTS.filter((item) => item.required).map((item) => item.id));
  return decisions.filter((item) => required.has(item.blockId) && !item.included).map((item) => `${item.blockId}: ${item.reason ?? "必需上下文缺失"}`);
}
