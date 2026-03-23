import type { LLMProvider } from "@ai-novel/shared/types/llm";

function normalizeModel(model: string | undefined): string {
  return (model ?? "").trim().toLowerCase();
}

export interface JsonCapability {
  supportsJsonObject: boolean;
  supportsJsonSchema: boolean;
}

export function supportsForcedJsonOutput(provider: LLMProvider, model?: string): boolean {
  return getJsonCapability(provider, model).supportsJsonObject;
}

export function getJsonCapability(provider: LLMProvider, model?: string): JsonCapability {
  const normalizedModel = normalizeModel(model);

  // 注意：这里的“能力”只用于选择 response_format / prompt 约束强度；
  // 最终仍以 Zod 校验作为强约束。
  const jsonCapabilities: Record<
    LLMProvider,
    {
      supportsJsonObject: boolean;
      supportsJsonSchema: boolean;
      modelCondition?: (normalizedModel: string) => boolean;
    }
  > = {
    openai: {
      supportsJsonObject: true,
      supportsJsonSchema: true,
      // 按你的要求：OpenAI 仅支持 GPT-5.x
      modelCondition: (m) => !m || /^gpt-5([^\w]|$)/.test(m) || m === "gpt-5",
    },
    deepseek: {
      supportsJsonObject: true,
      supportsJsonSchema: false,
      // deepseek 模型名通常不需要额外条件
    },
    grok: {
      supportsJsonObject: true,
      supportsJsonSchema: false,
    },
    anthropic: {
      supportsJsonObject: false,
      supportsJsonSchema: false,
    },
    siliconflow: {
      supportsJsonObject: false,
      supportsJsonSchema: false,
    },
    kimi: {
      supportsJsonObject: true,
      supportsJsonSchema: false,
    },
    glm: {
      supportsJsonObject: true,
      supportsJsonSchema: false,
    },
    qwen: {
      supportsJsonObject: true,
      supportsJsonSchema: false,
    },
    gemini: {
      supportsJsonObject: true,
      supportsJsonSchema: true,
      // 如后续你发现只有部分 Gemini 模型支持 schema，可在这里加条件
      modelCondition: () => true,
    },
  };

  const cap = jsonCapabilities[provider];
  if (!cap) {
    return { supportsJsonObject: false, supportsJsonSchema: false };
  }

  if (cap.modelCondition) {
    const ok = cap.modelCondition(normalizedModel);
    return { supportsJsonObject: cap.supportsJsonObject && ok, supportsJsonSchema: cap.supportsJsonSchema && ok };
  }

  return { supportsJsonObject: cap.supportsJsonObject, supportsJsonSchema: cap.supportsJsonSchema };
}
