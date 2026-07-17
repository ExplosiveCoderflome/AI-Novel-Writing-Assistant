import type { PromptInvocationMeta } from "../../../prompting/core/promptTypes";
import { llmLiveBroker, type LlmLiveSession } from "./LlmLiveBroker";

export function beginLlmLiveSession(input: {
  label: string;
  mode: "text" | "structured";
  promptMeta?: PromptInvocationMeta;
  provider?: string | null;
  model?: string | null;
}): LlmLiveSession {
  const meta = input.promptMeta;
  return llmLiveBroker.begin({
    label: input.label,
    mode: input.mode,
    promptId: meta?.promptId ?? null,
    promptVersion: meta?.promptVersion ?? null,
    taskId: meta?.taskId ?? null,
    novelId: meta?.novelId ?? null,
    chapterId: meta?.chapterId ?? null,
    volumeId: meta?.volumeId ?? null,
    stage: meta?.stage ?? null,
    itemKey: meta?.itemKey ?? null,
    provider: input.provider ?? null,
    model: input.model ?? null,
  });
}
