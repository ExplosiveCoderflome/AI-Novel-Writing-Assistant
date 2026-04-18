import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";

export type ImageModelProvider = "openai" | "siliconflow" | "grok";

const IMAGE_MODEL_SETTING_PREFIX = "provider.imageModel";

const IMAGE_MODEL_OPTIONS: Record<ImageModelProvider, string[]> = {
  openai: ["gpt-image-1"],
  siliconflow: ["black-forest-labs/FLUX.1-schnell"],
  grok: ["grok-imagine-image"],
};

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "P2021"
  );
}

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function supportsImageModelSettings(provider: LLMProvider): provider is ImageModelProvider {
  return provider === "openai" || provider === "siliconflow" || provider === "grok";
}

export function getImageModelSettingKey(provider: LLMProvider): string | null {
  if (!supportsImageModelSettings(provider)) {
    return null;
  }
  return `${IMAGE_MODEL_SETTING_PREFIX}.${provider}`;
}

export function getImageModelOptions(provider: LLMProvider): string[] {
  if (!supportsImageModelSettings(provider)) {
    return [];
  }
  return [...IMAGE_MODEL_OPTIONS[provider]];
}

export function getDefaultImageModel(provider: LLMProvider): string | undefined {
  return getImageModelOptions(provider)[0];
}

export function getProviderEnvImageModel(provider: LLMProvider): string | undefined {
  switch (provider) {
    case "openai":
      return normalizeOptionalText(process.env.OPENAI_IMAGE_MODEL);
    case "siliconflow":
      return normalizeOptionalText(process.env.SILICONFLOW_IMAGE_MODEL);
    case "grok":
      return normalizeOptionalText(process.env.XAI_IMAGE_MODEL);
    default:
      return undefined;
  }
}

export async function getProviderImageModel(provider: LLMProvider): Promise<string | undefined> {
  if (!supportsImageModelSettings(provider)) {
    return undefined;
  }
  const key = getImageModelSettingKey(provider);
  if (!key) {
    return undefined;
  }

  try {
    const record = await prisma.appSetting.findUnique({
      where: { key },
    });
    return normalizeOptionalText(record?.value)
      ?? getProviderEnvImageModel(provider)
      ?? getDefaultImageModel(provider);
  } catch (error) {
    if (isMissingTableError(error)) {
      return getProviderEnvImageModel(provider) ?? getDefaultImageModel(provider);
    }
    throw error;
  }
}

export async function getProviderImageModelMap(
  providers: LLMProvider[],
): Promise<Map<LLMProvider, string | undefined>> {
  const supportedProviders = Array.from(new Set(providers.filter((provider) => supportsImageModelSettings(provider))));
  const result = new Map<LLMProvider, string | undefined>();
  for (const provider of providers) {
    result.set(provider, getProviderEnvImageModel(provider) ?? getDefaultImageModel(provider));
  }
  if (supportedProviders.length === 0) {
    return result;
  }

  const keys = supportedProviders
    .map((provider) => getImageModelSettingKey(provider))
    .filter((value): value is string => Boolean(value));

  try {
    const records = await prisma.appSetting.findMany({
      where: {
        key: {
          in: keys,
        },
      },
    });
    const valueMap = new Map(records.map((item) => [item.key, normalizeOptionalText(item.value)]));
    for (const provider of supportedProviders) {
      const key = getImageModelSettingKey(provider);
      if (!key) {
        continue;
      }
      result.set(
        provider,
        valueMap.get(key)
          ?? getProviderEnvImageModel(provider)
          ?? getDefaultImageModel(provider),
      );
    }
    return result;
  } catch (error) {
    if (isMissingTableError(error)) {
      return result;
    }
    throw error;
  }
}

export async function saveProviderImageModel(
  provider: LLMProvider,
  imageModel: string | null | undefined,
): Promise<string | undefined> {
  if (!supportsImageModelSettings(provider)) {
    return undefined;
  }
  const key = getImageModelSettingKey(provider);
  if (!key) {
    return undefined;
  }

  const normalized = normalizeOptionalText(imageModel);

  try {
    if (!normalized) {
      await prisma.appSetting.deleteMany({
        where: { key },
      });
      return getProviderEnvImageModel(provider) ?? getDefaultImageModel(provider);
    }

    await prisma.appSetting.upsert({
      where: { key },
      update: { value: normalized },
      create: { key, value: normalized },
    });
    return normalized;
  } catch (error) {
    if (isMissingTableError(error)) {
      return normalized ?? getProviderEnvImageModel(provider) ?? getDefaultImageModel(provider);
    }
    throw error;
  }
}
