import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { ChatOpenAI } from "@langchain/openai";
import { prisma } from "../db/prisma";
import { PROVIDERS } from "./providers";

interface LLMOptions {
  model?: string;
  temperature?: number;
  apiKey?: string;
  baseURL?: string;
  maxTokens?: number;
}

interface ProviderSecret {
  key: string;
  model?: string;
}

const providerSecrets = new Map<LLMProvider, ProviderSecret>();

function getProviderEnvBaseUrl(provider: LLMProvider): string | undefined {
  switch (provider) {
    case "deepseek":
      return process.env.DEEPSEEK_BASE_URL;
    case "siliconflow":
      return process.env.SILICONFLOW_BASE_URL;
    case "openai":
      return process.env.OPENAI_BASE_URL;
    case "anthropic":
      return process.env.ANTHROPIC_BASE_URL;
    default:
      return undefined;
  }
}

function getProviderEnvModel(provider: LLMProvider): string | undefined {
  switch (provider) {
    case "deepseek":
      return process.env.DEEPSEEK_MODEL;
    case "siliconflow":
      return process.env.SILICONFLOW_MODEL;
    case "openai":
      return process.env.OPENAI_MODEL;
    case "anthropic":
      return process.env.ANTHROPIC_MODEL;
    default:
      return undefined;
  }
}

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2021"
  );
}

export async function loadProviderApiKeys(): Promise<void> {
  try {
    const keys = await prisma.aPIKey.findMany({
      where: { isActive: true },
    });
    providerSecrets.clear();
    for (const item of keys) {
      const provider = item.provider as LLMProvider;
      if (!(provider in PROVIDERS)) {
        continue;
      }
      providerSecrets.set(provider, {
        key: item.key,
        model: item.model ?? undefined,
      });
    }
  } catch (error) {
    if (isMissingTableError(error)) {
      return;
    }
    throw error;
  }
}

async function resolveProviderSecret(provider: LLMProvider): Promise<ProviderSecret | undefined> {
  const cached = providerSecrets.get(provider);
  if (cached) {
    return cached;
  }
  try {
    const secret = await prisma.aPIKey.findUnique({
      where: { provider },
    });
    if (!secret || !secret.isActive) {
      return undefined;
    }
    const value: ProviderSecret = {
      key: secret.key,
      model: secret.model ?? undefined,
    };
    providerSecrets.set(provider, value);
    return value;
  } catch (error) {
    if (isMissingTableError(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function getLLM(provider: LLMProvider, options: LLMOptions = {}): Promise<ChatOpenAI> {
  const providerConfig = PROVIDERS[provider];
  const dbSecret = await resolveProviderSecret(provider);
  const apiKey = options.apiKey ?? dbSecret?.key ?? process.env[providerConfig.envKey];

  if (!apiKey) {
    throw new Error(`未配置 ${providerConfig.name} 的 API Key。`);
  }

  const model =
    options.model ??
    dbSecret?.model ??
    getProviderEnvModel(provider) ??
    providerConfig.defaultModel;

  const baseURL =
    options.baseURL ??
    getProviderEnvBaseUrl(provider) ??
    providerConfig.baseURL;

  return new ChatOpenAI({
    apiKey,
    model,
    modelName: model,
    temperature: options.temperature ?? 0.7,
    maxTokens: options.maxTokens,
    configuration: {
      baseURL,
    },
  });
}
