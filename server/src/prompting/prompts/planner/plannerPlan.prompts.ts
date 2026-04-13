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
      requiredGroups:
        input.planLevel === "chapter"
          ? ["novel_overview", "chapter_target", "outline_source", "state_snapshot"]
          : undefined,
      preferredGroups:
        input.planLevel === "chapter"
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
    semanticRetryPolicy:
      input.planLevel === "chapter"
        ? { maxAttempts: 1 }
        : undefined,
    outputSchema: plannerOutputSchema,
    structuredOutputHint: {
      example: {
        title: "示例标题",
        objective: "示例目标",
        participants: ["示例参与方"],
        reveals: ["示例揭露"],
        riskNotes: ["示例风险"],
        hookTarget: "示例悬念",
        planRole: input.planLevel === "chapter" ? "progress" : "",
        phaseLabel: "示例阶段",
        mustAdvance: ["示例推进项"],
        mustPreserve: ["示例保留项"],
        scenes: input.includeScenes
          ? [{
            title: "示例场景",
            objective: "示例场景目标",
            conflict: "示例冲突",
            reveal: "示例变化",
            emotionBeat: "示例情绪节拍",
          }]
          : [],
      },
      note: input.includeScenes
        ? "当前层级必须返回可执行的 scenes 示例。"
        : "当前层级的 scenes 必须保持为空数组。",
    },
    render: (promptInput, context) => {
      const contextText = context.blocks.map((block) => block.content).join("\n\n");

      const systemPrompt = [
        "你是长篇小说规划助手，负责把当前层级的故事需求整理成可直接进入下一步写作或细化流程的结构化规划结果。",
        "",
        "只输出严格 JSON，不要输出 Markdown、解释、注释、代码块或额外文本。",
        `当前规划层级：${input.planLevel}。`,
        "",
        "输出必须包含以下字段：",
        "title、objective、participants、reveals、riskNotes、hookTarget、planRole、phaseLabel、mustAdvance、mustPreserve、scenes。",
        input.includeScenes
          ? "scenes 必须是非空数组，且每一项都必须包含：title、objective、conflict、reveal、emotionBeat。"
          : "scenes 必须返回空数组。",
        input.planLevel === "chapter"
          ? "当规划层级为 chapter 时，planRole 必填，且只能是：setup、progress、pressure、turn、payoff、cooldown。"
          : "当规划层级为 book 或 arc 时，planRole 可为空字符串，但不得乱填无效值。",
        "",
        "全局硬规则：",
        "1. 所有内容必须使用简体中文。",
        "2. 只能基于给定上下文规划，不得补写上下文之外的关键设定、人物关系或重大剧情。",
        "3. 输出必须服务于后续创作执行，而不是写分析说明。",
        "4. 各字段之间必须自洽，不得互相冲突。",
        "5. mustAdvance 和 mustPreserve 必须简短、具体、可直接用于后续写作。",
        "",
        "字段要求：",
        "1. title：写当前层级规划条目的标题，简洁明确，不要占位词。",
        "2. objective：必须明确说明这一层规划最核心的推进目标，不能写成泛泛摘要。",
        "3. participants：只列关键人物、关键势力或关键关系参与方，不要把所有人都塞进去。",
        "4. reveals：只写重要信息揭露、结构转折或关键认知变化，不要写普通过程。",
        "5. riskNotes：写最容易失焦、变平、失真、跑偏或违背约束的风险点，必须具体。",
        "6. hookTarget：写阶段尾部或章节尾部要留给读者的悬念、张力、期待或情绪牵引，不要写成空话。",
        "7. phaseLabel：用短语概括当前阶段，例如“试探压迫期”“关系绑定期”“身份松动期”，不要太长。",
        "8. mustAdvance：列出本层级绝不能缺席的推进项，必须是动作性、结果性或结构性推进。",
        "9. mustPreserve：列出不能破坏的连续性、世界规则、角色状态、语气边界或模式约束。",
        input.includeScenes
          ? "10. scenes 必须按顺序组织，且每一项都要能直接给写作阶段使用，不要写成概念标签。"
          : "10. 由于当前层级不要求场景细化，scenes 必须为空数组。",
        "",
        "故事模式规则：",
        "1. 当上下文存在故事模式约束时，primary mode 视为硬约束，secondary mode 只能作为轻量风味层。",
        "2. 不得突破故事模式给出的冲突上限。",
        "3. 不得依赖被明确禁止的冲突形式。",
        "",
        "质量要求：",
        "1. 输出必须像“可直接交给下一环节执行的规划结果”，而不是概念备忘录。",
        "2. 避免空泛表达，如“推进剧情”“增加冲突”“深化人物”。",
        "3. 所有数组项应使用短语或短句，避免冗长分析。",
      ].join("\n");

      const userPrompt = [
        promptInput.scopeLabel,
        "",
        "上下文：",
        contextText || "无",
        "",
        "输出要求：",
        "1. objective 必须明确回答“这一层现在到底要推进什么”。",
        "2. participants 只保留真正影响这一层推进的人物、势力或关系主体。",
        "3. reveals 只写关键揭露，不要把过程细节混进去。",
        "4. riskNotes 要优先指出最容易让这一层写坏的地方。",
        "5. hookTarget 要能直接服务读者追更，而不是抽象写“制造悬念”。",
        "6. phaseLabel 必须短、准、可识别。",
        "7. mustAdvance 必须列出不可缺席的推进项。",
        "8. mustPreserve 必须列出不能破坏的连续性、语气和硬约束。",
        input.includeScenes
          ? "9. scenes 必须顺序清晰，且每个 scene 都应体现具体动作、冲突或变化。"
          : "9. scenes 返回空数组。",
      ].join("\n");

      return [new SystemMessage(systemPrompt), new HumanMessage(userPrompt)];
    },
    postValidate: (output) => {
      const normalized = normalizePlannerOutput(output);

      if (!normalized.title?.trim()) {
        throw new Error("Planner output is missing title.");
      }

      if (!normalized.objective?.trim()) {
        throw new Error("Planner output is missing objective.");
      }

      if (!normalized.phaseLabel?.trim()) {
        throw new Error("Planner output is missing phaseLabel.");
      }

      if ((normalized.mustAdvance ?? []).length === 0) {
        throw new Error("Planner output is missing mustAdvance.");
      }

      if ((normalized.mustPreserve ?? []).length === 0) {
        throw new Error("Planner output is missing mustPreserve.");
      }

      if (input.planLevel === "chapter") {
        if (!normalized.planRole) {
          throw new Error("Chapter planner output is missing planRole.");
        }
        if (!["setup", "progress", "pressure", "turn", "payoff", "cooldown"].includes(normalized.planRole)) {
          throw new Error("Chapter planner output has invalid planRole.");
        }
        if ((normalized.scenes ?? []).length === 0) {
          throw new Error("Chapter planner output is missing scenes.");
        }
      }

      if (!input.includeScenes && (normalized.scenes ?? []).length > 0) {
        throw new Error("Planner output should not include scenes for this plan level.");
      }

      if (input.includeScenes) {
        for (const scene of normalized.scenes ?? []) {
          if (!scene.title?.trim()) {
            throw new Error("Planner scene is missing title.");
          }
          if (!scene.objective?.trim()) {
            throw new Error("Planner scene is missing objective.");
          }
          if (!scene.conflict?.trim()) {
            throw new Error("Planner scene is missing conflict.");
          }
          if (!scene.reveal?.trim()) {
            throw new Error("Planner scene is missing reveal.");
          }
          if (!scene.emotionBeat?.trim()) {
            throw new Error("Planner scene is missing emotionBeat.");
          }
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
