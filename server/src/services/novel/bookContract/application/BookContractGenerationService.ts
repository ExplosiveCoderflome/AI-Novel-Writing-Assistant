import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { BookContractDraft } from "@ai-novel/shared/types/novelWorkflow";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import {
  buildDirectorBookContractContextBlocks,
  directorBookContractPrompt,
  type DirectorBookContractPromptInput,
} from "../../../../prompting/prompts/novel/directorPlanning.prompts";
import { normalizeBookContract } from "../domain/normalizeBookContract";

export interface BookContractGenerationInput {
  novelId: string;
  taskId?: string;
  promptInput: DirectorBookContractPromptInput;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  entrypoint?: string;
}

export class BookContractGenerationService {
  async generate(input: BookContractGenerationInput): Promise<BookContractDraft> {
    const requestedTemperature = input.temperature ?? 0.4;
    const parsed = await runStructuredPrompt({
      asset: directorBookContractPrompt,
      promptInput: input.promptInput,
      contextBlocks: buildDirectorBookContractContextBlocks(input.promptInput),
      options: {
        provider: input.provider,
        model: input.model,
        temperature: Math.min(requestedTemperature, 0.4),
        novelId: input.novelId,
        taskId: input.taskId,
        stage: "story_macro",
        itemKey: "book_contract",
        entrypoint: input.entrypoint ?? "auto_director",
      },
    });
    return normalizeBookContract(parsed.output);
  }
}
