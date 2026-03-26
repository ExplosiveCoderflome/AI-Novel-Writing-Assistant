import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { StoryPlanLevel } from "@ai-novel/shared/types/novel";
import type { PromptAsset } from "../../core/promptTypes";
import { normalizePlannerOutput, type PlannerOutput } from "../../../services/planner/plannerOutputNormalization";
import { plannerOutputSchema } from "../../../services/planner/plannerSchemas";

interface PlannerPlanPromptInput {
  scopeLabel: string;
}

function buildPlannerPlanAsset(input: {
  id: string;
  version: string;
  planLevel: StoryPlanLevel;
  includeScenes: boolean;
  maxTokensBudget: number;
}): PromptAsset<PlannerPlanPromptInput, PlannerOutput> {
  return {
    id: input.id,
    version: input.version,
    taskType: "planner",
    mode: "structured",
    language: "zh",
    contextPolicy: {
      maxTokensBudget: input.maxTokensBudget,
      requiredGroups: input.planLevel === "chapter"
        ? ["novel_overview", "chapter_target", "outline_source", "state_snapshot"]
        : undefined,
      preferredGroups: input.planLevel === "chapter"
        ? ["book_plan", "arc_plans", "volume_summary", "story_mode"]
        : ["story_mode", "book_bible"],
      dropOrder: [
        "recent_decisions",
        "character_dynamics",
        "plot_beats",
        "recent_summaries",
        "arc_plans",
        "book_plan",
        "volume_summary",
      ],
    },
    semanticRetryPolicy: input.planLevel === "chapter"
      ? { maxAttempts: 1 }
      : undefined,
    outputSchema: plannerOutputSchema,
    render: (promptInput, context) => {
      const contextText = context.blocks.map((block) => block.content).join("\n\n");
      const systemPrompt = [
        "你是长篇小说规划助手。",
        "只输出严格 JSON。",
        `当前规划层级：${input.planLevel}。`,
        "输出必须包含 title、objective、participants、reveals、riskNotes、hookTarget、planRole、phaseLabel、mustAdvance、mustPreserve、scenes。",
        input.includeScenes
          ? "scenes 必须是数组，且每一项都必须包含 title、objective、conflict、reveal、emotionBeat。"
          : "scenes 必须返回空数组。",
        input.planLevel === "chapter"
          ? "chapter 规划必须给出 planRole，且只能是 setup、progress、pressure、turn、payoff、cooldown 之一。"
          : "book 和 arc 规划可以不填写 planRole。",
        "mustAdvance 和 mustPreserve 必须简短、具体、可直接供后续写作使用。",
        "不要输出 Markdown，不要输出解释。",
      ].join("\n");
      const userPrompt = [
        promptInput.scopeLabel,
        "",
        "上下文：",
        contextText || "无",
        "",
        "输出要求：",
        "1. objective 必须说明这一层规划的主推进目标。",
        "2. participants 只列关键人物或势力。",
        "3. reveals 只写重要信息揭露或结构转折。",
        "4. riskNotes 说明最容易失焦、变平或违背约束的风险。",
        "5. hookTarget 说明章节尾部或阶段尾部要留给读者的悬念、张力或情绪牵引。",
        "6. phaseLabel 必须用短语概括当前阶段。",
        "7. mustAdvance 必须列出不可缺席的推进项。",
        "8. mustPreserve 必须列出不能破坏的连续性、语气和硬约束。",
        "9. 当上下文中存在故事模式约束时，primary mode 视为硬约束，secondary mode 只能作为轻量风味层。",
        "10. 不能突破故事模式给出的冲突上限，也不能依赖被明确禁止的冲突形式。",
        input.includeScenes
          ? "11. scenes 必须按顺序组织，并且能直接给章节写作阶段使用。"
          : "11. scenes 返回空数组。",
      ].join("\n");
      return [
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ];
    },
    postValidate: (output) => {
      const normalized = normalizePlannerOutput(output);
      if (input.planLevel === "chapter") {
        if (!normalized.objective?.trim()) {
          throw new Error("Chapter planner output is missing objective.");
        }
        if (!normalized.planRole) {
          throw new Error("Chapter planner output is missing planRole.");
        }
        if ((normalized.mustAdvance ?? []).length === 0) {
          throw new Error("Chapter planner output is missing mustAdvance.");
        }
        if ((normalized.mustPreserve ?? []).length === 0) {
          throw new Error("Chapter planner output is missing mustPreserve.");
        }
        if ((normalized.scenes ?? []).length === 0) {
          throw new Error("Chapter planner output is missing scenes.");
        }
      }
      return normalized;
    },
  };
}

export const plannerBookPlanPrompt = buildPlannerPlanAsset({
  id: "planner.book.plan",
  version: "v1",
  planLevel: "book",
  includeScenes: false,
  maxTokensBudget: 1800,
});

export const plannerArcPlanPrompt = buildPlannerPlanAsset({
  id: "planner.arc.plan",
  version: "v1",
  planLevel: "arc",
  includeScenes: false,
  maxTokensBudget: 1800,
});

export const plannerChapterPlanPrompt = buildPlannerPlanAsset({
  id: "planner.chapter.plan",
  version: "v1",
  planLevel: "chapter",
  includeScenes: true,
  maxTokensBudget: 2400,
});
