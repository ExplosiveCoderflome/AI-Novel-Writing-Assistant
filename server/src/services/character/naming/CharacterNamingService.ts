import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { characterNamingRequestSchema } from "@ai-novel/shared/types/characterNaming";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { characterNamingCandidatesPrompt } from "../../../prompting/prompts/character/naming/characterNaming.prompts";

/** One bounded candidate request; never creates a character or rewrites prose. */
export async function generateCharacterNamingCandidates(request: unknown, options: { provider?: LLMProvider; model?: string }) {
  const promptInput = characterNamingRequestSchema.parse(request);
  const result = await runStructuredPrompt({
    asset: characterNamingCandidatesPrompt,
    promptInput,
    options: { ...options, temperature: 0.65 },
  });
  return result.output;
}
