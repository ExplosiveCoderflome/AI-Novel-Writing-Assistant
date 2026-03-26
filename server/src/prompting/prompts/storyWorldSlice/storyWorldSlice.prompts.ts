import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { buildStoryWorldSlicePrompt } from "../../../services/novel/storyWorldSlice/storyWorldSlicePrompt";
import { storyWorldSliceRawPayloadSchema } from "./storyWorldSlice.promptSchemas";

export type StoryWorldSlicePromptInput = Parameters<typeof buildStoryWorldSlicePrompt>[0];

export const storyWorldSlicePrompt: PromptAsset<
  StoryWorldSlicePromptInput,
  z.infer<typeof storyWorldSliceRawPayloadSchema>
> = {
  id: "storyWorldSlice.generate",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: storyWorldSliceRawPayloadSchema,
  render: (input) => {
    const prompt = buildStoryWorldSlicePrompt(input);
    return [
      new SystemMessage(prompt.system),
      new HumanMessage(prompt.user),
    ];
  },
};
