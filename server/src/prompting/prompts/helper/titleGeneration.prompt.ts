import type { PromptAsset } from "../../core/promptTypes";
import type { TitlePromptContext } from "../../../services/title/titleGeneration.shared";
import { buildTitleGenerationMessages } from "../../../services/title/titlePromptBuilder";
import { titleGenerationRawOutputSchema } from "./titleGeneration.promptSchemas";

export interface TitleGenerationPromptInput {
  context: TitlePromptContext;
  forceJson: boolean;
  retryReason: string | null;
}

export const titleGenerationPrompt: PromptAsset<
  TitleGenerationPromptInput,
  typeof titleGenerationRawOutputSchema._output
> = {
  id: "title.generation",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: titleGenerationRawOutputSchema,
  render: (input) => buildTitleGenerationMessages(input.context, {
    forceJson: input.forceJson,
    retryReason: input.retryReason,
  }),
};
