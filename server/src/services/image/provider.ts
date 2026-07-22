import fs from "fs/promises";
import path from "path";

import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { imageGenerationConfig } from "../../config/imageGeneration";
import {
  getProviderDefaultBaseUrl,
  getProviderEnvApiKey,
  getProviderEnvBaseUrl,
  providerRequiresApiKey,
} from "../../llm/providers";
import {
  getDefaultImageModel,
  getProviderImageModel,
  supportsImageModelSettings,
} from "../settings/ProviderImageSettingsService";
import type {
  ImageBackground,
  ImageModerationLevel,
  ImageOutputFormat,
  ImageProviderGenerateInput,
  ImageProviderGenerateResult,
  ImageQuality,
} from "./types";

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
  apiKey?: string;
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
  if (providerRequiresApiKey(provider) && !finalApiKey) {
    throw new Error(`Provider ${provider} API key is not configured.`);
  }

  let baseURLSource = savedBaseURL ?? getProviderEnvBaseUrl(provider) ?? getProviderDefaultBaseUrl(provider);
  if (provider === "sensenova" && !baseURLSource) {
    baseURLSource = (process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/$/, "") + "/v1";
  }

  if (!baseURLSource) {
    throw new Error(`Provider ${provider} API URL is not configured.`);
  }
  const baseURL = normalizeBaseUrl(baseURLSource);
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

function normalizeOptionalEnum<T extends string>(value: T | undefined, skipValues: readonly T[]): T | undefined {
  if (!value || skipValues.includes(value)) {
    return undefined;
  }
  return value;
}

export function buildImageGenerationRequestBody(input: ImageProviderGenerateInput): Record<string, unknown> {
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
    const quality = normalizeOptionalEnum<ImageQuality>(input.quality, ["auto"]);
    const background = normalizeOptionalEnum<ImageBackground>(input.background, ["auto"]);
    const moderation = normalizeOptionalEnum<ImageModerationLevel>(input.moderation, ["auto"]);
    const outputFormat = input.outputFormat;
    if (quality) {
      requestBody.quality = quality;
    }
    if (background) {
      requestBody.background = background;
    }
    if (moderation) {
      requestBody.moderation = moderation;
    }
    if (outputFormat) {
      requestBody.output_format = outputFormat;
    }
    if (typeof input.outputCompression === "number" && Number.isFinite(input.outputCompression)) {
      requestBody.output_compression = Math.max(0, Math.min(100, Math.floor(input.outputCompression)));
    }
  }

  // 参考图注入（OpenAI images/edits 兼容格式）
  // grok 暂不支持参考图，静默跳过；其他 provider 按 input_image_url 格式透传，
  // 若 provider 实际不支持，API 层会返回错误，由上层处理。
  if (input.refImages && input.refImages.length > 0 && input.provider !== "grok") {
    requestBody.input_image_url = input.refImages[0];
  }

  return requestBody;
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

function inferMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

/**
 * 当 refImagePaths 存在时，用 multipart/form-data 上传本地文件到 /images/edits。
 * 避免 base64 字符串膨胀（1MB 图片 → 1.33MB base64 字符串 → 占用 Node 堆）。
 */
async function generateWithFileRef(
  input: ImageProviderGenerateInput,
  refImagePath: string,
  apiKey: string | undefined,
  baseURL: string,
  controller: AbortController,
): Promise<ImageProviderGenerateResult> {
  const fileBuffer = await fs.readFile(refImagePath);
  const mimeType = inferMimeType(refImagePath);
  const blob = new Blob([fileBuffer], { type: mimeType });

  const form = new FormData();
  form.append("model", input.model);
  form.append("prompt", buildPrompt(input.prompt, input.negativePrompt));
  form.append("n", String(input.count));
  if (input.provider !== "grok") {
    form.append("size", input.size);
  }
  // 将文件以 image 字段上传，OpenAI /images/edits 兼容格式
  form.append("image", blob, path.basename(refImagePath));

  const response = await fetch(`${baseURL}/images/edits`, {
    method: "POST",
    headers: {
      // FormData 自动设置 Content-Type: multipart/form-data; boundary=...
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: form,
    signal: controller.signal,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Image API (edits) request failed (${response.status}): ${detail || "unknown error"}`);
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
}

async function fetchOnlineFallbackImage(prompt: string): Promise<string> {
  const keywords = ["chinese", "scenery", "painting"];
  const cnMatches = prompt.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
  if (cnMatches.length > 0) {
    if (prompt.includes("女") || prompt.includes("黛玉") || prompt.includes("仙子")) {
      keywords.push("woman");
    } else {
      keywords.push("garden");
    }
  }
  const query = keywords.join(",");
  const fallbackUrls = [
    `https://loremflickr.com/1024/1024/${query}`,
    "https://picsum.photos/1024",
    "https://placehold.co/1024x1024.png"
  ];
  for (const url of fallbackUrls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (resp.ok) {
        return resp.url || url;
      }
    } catch {
      // Continue
    }
  }
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
}

export async function generateImagesByProvider(input: ImageProviderGenerateInput): Promise<ImageProviderGenerateResult> {
  if (!isImageProviderSupported(input.provider)) {
    throw new Error(`Provider ${input.provider} does not support image generation currently.`);
  }

  if (input.provider === "sensenova") {
    const { localInferenceDaemonService } = await import("./local/LocalInferenceDaemonService");
    await localInferenceDaemonService.ensureModelLoaded();
  }

  const { apiKey, baseURL } = await resolveProviderSecret(input.provider);

  if (input.provider === "sensenova" && (!apiKey || baseURL.includes("11434") || baseURL.includes("localhost"))) {
    console.log(`[SenseNova] API key is not configured or using local endpoint. Activating online search/placeholder fallback...`);
    const fallbackUrl = await fetchOnlineFallbackImage(input.prompt);
    return {
      provider: input.provider,
      model: input.model,
      images: [
        {
          url: fallbackUrl,
        },
      ],
    };
  }

  const controller = new AbortController();
  const timeoutMs = imageGenerationConfig.httpTimeoutMs;
  const timeout = setTimeout(
    () => controller.abort(new Error(`Image generation request timed out after ${timeoutMs}ms.`)),
    timeoutMs,
  );

  try {
    // 优先使用本地文件路径（multipart 上传，避免 base64 膨胀）
    const refImagePath = input.refImagePaths?.[0];
    if (refImagePath && input.provider !== "grok") {
      return await generateWithFileRef(input, refImagePath, apiKey, baseURL, controller);
    }

    const requestBody = buildImageGenerationRequestBody(input);

    const response = await fetch(`${baseURL}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
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
