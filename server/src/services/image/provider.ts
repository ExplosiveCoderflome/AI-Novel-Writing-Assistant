import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { getProviderEnvApiKey, getProviderEnvBaseUrl, PROVIDERS } from "../../llm/providers";
import {
  getDefaultImageModel,
  getProviderImageModel,
  supportsImageModelSettings,
} from "../settings/ProviderImageSettingsService";
import type { ImageProviderGenerateInput, ImageProviderGenerateResult } from "./types";

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "P2021"
  );
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
  let savedApiKey: string | undefined;
  let savedBaseURL: string | undefined;

  try {
    const config = await prisma.aPIKey.findUnique({
      where: { provider },
    });
    if (config?.isActive) {
      savedApiKey = config.key?.trim() || undefined;
      savedBaseURL = config.baseURL?.trim() || undefined;
    }
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  const finalApiKey = savedApiKey ?? getProviderEnvApiKey(provider);
  if (!finalApiKey) {
    throw new Error(`Provider ${provider} API key is not configured.`);
  }

  const defaultBaseURL = provider === "grok"
    ? "https://api.x.ai/v1"
    : provider === "openai"
      ? "https://api.openai.com/v1"
      : PROVIDERS.siliconflow.baseURL;

  const baseURL = normalizeBaseUrl(savedBaseURL ?? getProviderEnvBaseUrl(provider) ?? defaultBaseURL);
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
  return supportsImageModelSettings(provider);
}

export async function resolveImageModel(provider: LLMProvider, model?: string): Promise<string> {
  const resolved = model?.trim()
    || await getProviderImageModel(provider)
    || getDefaultImageModel(provider);
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
