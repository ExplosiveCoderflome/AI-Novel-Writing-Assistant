import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { StoryPlanLevel } from "@ai-novel/shared/types/novel";
import { invokeStructuredLlm } from "../../llm/structuredInvoke";
import { normalizePlannerOutput, type PlannerOutput } from "./plannerOutputNormalization";
import { plannerOutputSchema } from "./plannerSchemas";

export interface PlannerLlmOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export async function invokePlannerLLM(input: {
  options: PlannerLlmOptions;
  scopeLabel: string;
  context: string;
  includeScenes: boolean;
  planLevel: StoryPlanLevel;
}): Promise<PlannerOutput> {
  const systemPrompt =
    `你是小说策划。请严格输出 JSON，字段为 title, objective, participants, reveals, riskNotes, hookTarget, planRole, phaseLabel, mustAdvance, mustPreserve, scenes。level=${input.planLevel}。${input.includeScenes ? "scenes 必须是数组，每项含 title, objective, conflict, reveal, emotionBeat。" : "scenes 直接输出空数组。"} book/arc 可将 planRole 置空字符串；chapter 必须给出 planRole。不要输出解释。`;

  const userPrompt =
    `${input.scopeLabel}

上下文：
${input.context}

要求：
1. objective 必须明确本次规划的主推进目标。
2. participants 只列关键参与角色名字。
3. reveals 列关键揭露或推进的信息点。
4. riskNotes 列容易跑偏的风险。
5. hookTarget 列章节结尾要留下的钩子。
6. chapter 级规划必须补充 planRole（setup/progress/pressure/turn/payoff/cooldown）。
7. phaseLabel 用一句短语概括当前阶段。
8. mustAdvance 列本章必须推进的关键点。
9. mustPreserve 列本章绝不能丢掉的连续性要求。
10. 场景必须有顺序，能直接给写作器消费。`;

  const parsed = await invokeStructuredLlm({
    label: `planner:${input.planLevel}`,
    provider: input.options.provider,
    model: input.options.model,
    temperature: input.options.temperature ?? 0.4,
    taskType: "planner",
    systemPrompt,
    userPrompt,
    schema: plannerOutputSchema,
    maxRepairAttempts: 1,
  });

  return normalizePlannerOutput(parsed);
}
