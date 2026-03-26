import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PlannerInput, StructuredIntent } from "../../../agents/types";
import { normalizeIntentPayload } from "../../../agents/planner/utils";
import {
  buildPlannerIntentPromptParts,
  intentSchema,
  summarizeIntentValidationFailure,
} from "../../../agents/planner/intentPromptSupport";
import type { PromptAsset } from "../../core/promptTypes";

export const plannerIntentPrompt: PromptAsset<PlannerInput, StructuredIntent, Record<string, unknown>> = {
  id: "planner.intent.parse",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: z
    .record(z.string(), z.unknown())
    .refine((value) => !Array.isArray(value), { message: "Expected JSON object." }),
  render: (input) => {
    const prompt = buildPlannerIntentPromptParts(input);
    return [
      new SystemMessage(prompt.systemPrompt),
      new HumanMessage(prompt.userPrompt),
    ];
  },
  postValidate: (output, input) => {
    const normalizedPayload = normalizeIntentPayload(output, input);
    const result = intentSchema.safeParse(normalizedPayload);
    if (!result.success) {
      throw new Error(summarizeIntentValidationFailure(normalizedPayload, result.error.issues));
    }
    return result.data;
  },
};
