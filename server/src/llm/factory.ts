import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { ChatOpenAI } from "@langchain/openai";
import { prisma } from "../db/prisma";
import { attachLLMDebugLogging } from "./debugLogging";
import { resolveModelTemperature } from "./capabilities";
import { resolveModel, type TaskType } from "./modelRouter";
import { PROVIDERS } from "./providers";
import type { PromptInvocationMeta } from "../prompting/core/promptTypes";

interface LLMOptions {
  model?: string;
  temperature?: number;
  apiKey?: string;
  baseURL?: string;
  maxTokens?: number;
  fallbackProvider?: LLMProvider;
  /** 任务类型，用于模型路由；若提供则优先使用路由配置的 provider/model/temperature */
  taskType?: TaskType;
  promptMeta?: PromptInvocationMeta;
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
    case "grok":
      return process.env.XAI_BASE_URL;
    case "kimi":
      return process.env.KIMI_BASE_URL;
    case "glm":
      return process.env.GLM_BASE_URL;
    case "qwen":
      return process.env.QWEN_BASE_URL;
    case "gemini":
      return process.env.GEMINI_BASE_URL;
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
    case "grok":
      return process.env.XAI_MODEL;
    case "kimi":
      return process.env.KIMI_MODEL;
    case "glm":
      return process.env.GLM_MODEL;
    case "qwen":
      return process.env.QWEN_MODEL;
    case "gemini":
      return process.env.GEMINI_MODEL;
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

export async function getLLM(provider?: LLMProvider, options: LLMOptions = {}): Promise<ChatOpenAI> {
  let resolvedProvider = provider ?? options.fallbackProvider ?? "deepseek";
  let resolvedModel: string | undefined = options.model;
  let resolvedTemperature: number | undefined = options.temperature;
  let resolvedMaxTokens: number | undefined = options.maxTokens;

  if (options.taskType) {
    const hasExplicitProvider = provider != null;
    const hasExplicitModel = options.model != null;
    const shouldUseRouteProvider = !hasExplicitProvider && !hasExplicitModel;
    const route = await resolveModel(options.taskType, {
      ...(shouldUseRouteProvider ? {} : { provider: resolvedProvider }),
      ...(options.model != null ? { model: options.model } : {}),
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
      ...(options.maxTokens != null ? { maxTokens: options.maxTokens } : {}),
    });
    if (shouldUseRouteProvider) {
      resolvedProvider = route.provider;
    }
    if (options.model == null && shouldUseRouteProvider) {
      resolvedModel = route.model;
    }
    if (options.temperature == null) resolvedTemperature = route.temperature;
    if (options.maxTokens == null) resolvedMaxTokens = route.maxTokens;
  }

  const providerConfig = PROVIDERS[resolvedProvider];
  const dbSecret = await resolveProviderSecret(resolvedProvider);
  const apiKey = options.apiKey ?? dbSecret?.key ?? process.env[providerConfig.envKey];

  if (!apiKey) {
    throw new Error(`未配置 ${providerConfig.name} 的 API Key。`);
  }

  const model =
    resolvedModel ??
    dbSecret?.model ??
    getProviderEnvModel(resolvedProvider) ??
    providerConfig.defaultModel;

  const baseURL =
    options.baseURL ??
    getProviderEnvBaseUrl(resolvedProvider) ??
    providerConfig.baseURL;
  const temperature = resolveModelTemperature(resolvedProvider, model, resolvedTemperature);

  const llm = new ChatOpenAI({
    apiKey,
    model,
    modelName: model,
    temperature,
    maxTokens: resolvedMaxTokens,
    configuration: {
      baseURL,
    },
  });

  return attachLLMDebugLogging(llm, {
    provider: resolvedProvider,
    model,
    temperature,
    maxTokens: resolvedMaxTokens,
    taskType: options.taskType,
    baseURL,
    promptMeta: options.promptMeta,
  });
}
