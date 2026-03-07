import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { BaseMessage } from "@langchain/core/messages";
import { supportsForcedJsonOutput } from "../../llm/capabilities";
import { getLLM } from "../../llm/factory";

export async function invokeWithJsonGuard(
  llm: Awaited<ReturnType<typeof getLLM>>,
  messages: BaseMessage[],
  provider: LLMProvider,
  model?: string,
) {
  if (!supportsForcedJsonOutput(provider, model)) {
    return llm.invoke(messages);
  }

  try {
    return await llm.invoke(messages, {
      response_format: { type: "json_object" },
    } as Record<string, unknown>);
  } catch {
    return llm.invoke(messages);
  }
}
