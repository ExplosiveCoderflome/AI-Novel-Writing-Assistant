import type { LLMProvider } from "@ai-novel/shared/types/llm";

function normalizeModel(model: string | undefined): string {
  return (model ?? "").trim().toLowerCase();
}

export function supportsForcedJsonOutput(provider: LLMProvider, model?: string): boolean {
  const normalized = normalizeModel(model);

  switch (provider) {
    case "anthropic":
      return false;
    case "openai":
      return /^gpt-(4|5|o|3\.5)/.test(normalized) || normalized.includes("gpt");
    case "deepseek":
      return normalized.includes("deepseek") || normalized.length === 0;
    case "grok":
      return normalized.includes("grok") || normalized.length === 0;
    case "siliconflow":
      return false;
    default:
      return false;
  }
}
