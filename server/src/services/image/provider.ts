import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import type { ImageProviderGenerateInput, ImageProviderGenerateResult } from "./types";

const SUPPORTED_IMAGE_PROVIDERS = new Set<LLMProvider>(["openai", "siliconflow", "grok", "longcat"]);

const IMAGE_DEFAULT_MODELS: Partial<Record<LLMProvider, string>> = {
  deepseek: "deepseek-chat",
  siliconflow: "black-forest-labs/FLUX.1-schnell",
  openai: "gpt-image-1",
  anthropic: "claude-3-5-sonnet-20241022",
  grok: "grok-imagine-image",
  longcat: "LongCat-Flash-Chat",
};

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
    case "longcat":
      return process.env.LONGCAT_BASE_URL;
    default:
      return undefined;
  }
}

function getProviderEnvImageModel(provider: LLMProvider): string | undefined {
  switch (provider) {
    case "siliconflow":
      return process.env.SILICONFLOW_IMAGE_MODEL;
    case "openai":
      return process.env.OPENAI_IMAGE_MODEL;
    case "grok":
      return process.env.XAI_IMAGE_MODEL;
    case "longcat":
      return process.env.LONGCAT_MODEL;
    default:
      return undefined;
  }
}

function getProviderEnvKey(provider: LLMProvider): string | undefined {
  switch (provider) {
    case "deepseek":
      return process.env.DEEPSEEK_API_KEY;
    case "siliconflow":
      return process.env.SILICONFLOW_API_KEY;
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "grok":
      return process.env.XAI_API_KEY;
    case "longcat":
      return process.env.LONGCAT_API_KEY;
    default:
      return undefined;
  }
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

interface ProviderSecret {
  apiKey: string;
  baseURL: string;
}

function mapSizeToAspectRatio(size: string): string | undefined {
  const mapping: Record<string, string> = {
    "512x512": "1:1",
    "768x768": "1:1",
    "1024x1024": "1:1",
    "1024x1536": "2:3",
    "1536x1024": "3:2",
  };
  return mapping[size];
}

async function resolveProviderSecret(provider: LLMProvider): Promise<ProviderSecret> {
  const config = await prisma.aPIKey.findUnique({
    where: { provider },
  });
  const apiKey = config?.isActive ? config.key : undefined;
  const fallbackApiKey = getProviderEnvKey(provider);
  const finalApiKey = apiKey ?? fallbackApiKey;
  if (!finalApiKey) {
    throw new Error(`Provider ${provider} API key is not configured.`);
  }
  const baseURL = normalizeBaseUrl(
    getProviderEnvBaseUrl(provider)
      ?? (
        provider === "openai"
          ? "https://api.openai.com/v1"
          : provider === "grok"
            ? "https://api.x.ai/v1"
            : "https://api.siliconflow.cn/v1"
      ),
  );
  return { apiKey: finalApiKey, baseURL };
}

function parseImagesFromPayload(payload: unknown): Array<{
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
}> {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    return [];
  }
  const images: Array<{
    url: string;
    mimeType?: string;
    width?: number;
    height?: number;
    metadata?: Record<string, unknown>;
  }> = [];

  for (const item of data) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as {
      url?: unknown;
      b64_json?: unknown;
      mime_type?: unknown;
      width?: unknown;
      height?: unknown;
    };
    const rawUrl = typeof row.url === "string"
      ? row.url
      : typeof row.b64_json === "string"
        ? `data:image/png;base64,${row.b64_json}`
        : "";
    if (!rawUrl) {
      continue;
    }
    images.push({
      url: rawUrl,
      mimeType: typeof row.mime_type === "string" ? row.mime_type : undefined,
      width: typeof row.width === "number" ? row.width : undefined,
      height: typeof row.height === "number" ? row.height : undefined,
      metadata: {},
    });
  }
  return images;
}

function buildPrompt(prompt: string, negativePrompt?: string): string {
  const cleanPrompt = prompt.trim();
  const cleanNegativePrompt = negativePrompt?.trim();
  if (!cleanNegativePrompt) {
    return cleanPrompt;
  }
  return `${cleanPrompt}\n\nAvoid: ${cleanNegativePrompt}`;
}

export function isImageProviderSupported(provider: LLMProvider): boolean {
  return SUPPORTED_IMAGE_PROVIDERS.has(provider);
}

export function resolveImageModel(provider: LLMProvider, model?: string): string {
  const resolved = model?.trim() || getProviderEnvImageModel(provider) || IMAGE_DEFAULT_MODELS[provider];
  if (!resolved) {
    throw new Error(`No default image model configured for provider=${provider}.`);
  }
  return resolved;
}

export async function generateImagesByProvider(input: ImageProviderGenerateInput): Promise<ImageProviderGenerateResult> {
  if (!isImageProviderSupported(input.provider)) {
    throw new Error(`Provider ${input.provider} does not support image generation currently.`);
  }

  const { apiKey, baseURL } = await resolveProviderSecret(input.provider);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const requestBody: Record<string, unknown> = {
      model: input.model,
      prompt: buildPrompt(input.prompt, input.negativePrompt),
      n: input.count,
    };
    if (input.provider === "grok") {
      const aspectRatio = mapSizeToAspectRatio(input.size);
      if (aspectRatio) {
        requestBody.aspect_ratio = aspectRatio;
      }
      requestBody.resolution = "1k";
    } else {
      requestBody.size = input.size;
    }

    const response = await fetch(`${baseURL}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Image API request failed (${response.status}): ${detail || "unknown error"}`);
    }

    const payload = (await response.json()) as unknown;
    const images = parseImagesFromPayload(payload);
    if (images.length === 0) {
      throw new Error("Image API returned empty data.");
    }

    return {
      provider: input.provider,
      model: input.model,
      images: images.map((item, index) => ({
        ...item,
        seed: typeof input.seed === "number" ? input.seed + index : undefined,
      })),
    };
  } finally {
    clearTimeout(timeout);
  }
}
