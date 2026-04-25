import type { LLMProvider } from "@ai-novel/shared/types/llm";

export type TransportProtocol = "openai" | "anthropic";

function normalizeOptionalText(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function isTkRoutedModel(model?: string | null): boolean {
  return normalizeOptionalText(model).startsWith("tk/");
}

export function shouldUseAnthropicMessagesTransport(
  provider: LLMProvider,
  model?: string | null,
): boolean {
  if (provider === "anthropic") {
    return true;
  }
  return isTkRoutedModel(model);
}

export function resolveTransportProtocol(
  provider: LLMProvider,
  model?: string | null,
): TransportProtocol {
  return shouldUseAnthropicMessagesTransport(provider, model) ? "anthropic" : "openai";
}
