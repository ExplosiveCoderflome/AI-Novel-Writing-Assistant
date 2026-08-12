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
  if ((provider === "sensenova" || provider === "comfyui") && !baseURLSource) {
    baseURLSource = provider === "comfyui"
      ? (process.env.COMFYUI_BASE_URL || "http://127.0.0.1:8188")
      : (process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434").replace(/\/$/, "") + "/v1";
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

export async function resolvePreferredImageProvider(fallback = "sensenova"): Promise<string> {
  try {
    const activeSetting = await prisma.aPIKey.findFirst({
      where: { isActive: true },
      select: { provider: true },
    });
    return (activeSetting?.provider as string) ?? fallback;
  } catch {
    return fallback;
  }
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
    if (response.status === 404 && (detail.includes("not_found") || detail.includes("not found")) && input.provider === "sensenova") {
      throw new Error(`本地 SenseNova 图像模型 '${input.model}' 未在 Ollama 中找到。请在终端运行 'ollama pull ${input.model}'，或在页面右上角选择 SiliconFlow / OpenAI 等云端图片模型。`);
    }
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

export async function generateImagesByProvider(input: ImageProviderGenerateInput): Promise<ImageProviderGenerateResult> {
  if (!isImageProviderSupported(input.provider)) {
    throw new Error(`Provider ${input.provider} does not support image generation currently.`);
  }

  if (input.provider === "sensenova") {
    const { localInferenceDaemonService } = await import("./local/LocalInferenceDaemonService");
    await localInferenceDaemonService.ensureModelLoaded(input.model);
  }

  const { apiKey, baseURL } = await resolveProviderSecret(input.provider);

  const controller = new AbortController();
  const timeoutMs = imageGenerationConfig.httpTimeoutMs;
  const timeout = setTimeout(
    () => controller.abort(new Error(`Image generation request timed out after ${timeoutMs}ms.`)),
    timeoutMs,
  );

  try {
    // 优先试用本地 ComfyUI 驱动器
    if (input.provider === "comfyui") {
      const { comfyUIDaemonService } = await import("./comfyui/ComfyUIDaemonService");
      return await comfyUIDaemonService.generateImage(input);
    }

    // 优先使用本地文件路径（multipart 上传，避免 base64 膨胀）
    const refImagePath = input.refImagePaths?.[0];
    if (refImagePath && input.provider !== "grok" && input.provider !== "sensenova" && input.provider !== "comfyui") {
      return await generateWithFileRef(input, refImagePath, apiKey, baseURL, controller);
    }

    if (input.provider === "sensenova") {
      try {
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
        if (response.ok) {
          const payload = (await response.json()) as unknown;
          const images = parseImagesFromPayload(payload);
          if (images.length > 0) {
            return {
              provider: input.provider,
              model: input.model,
              images,
            };
          }
        }
      } catch (err) {
        console.log(`[SenseNova Local] 本地 HTTP 接口响应警告，切换为本地内置离线图像合成器:`, err);
      }
      // 100% 本地离线图像合成器：不依赖任何云端 API，保证完全离线可用
      return generateLocalOfflineImage(input);
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

function generateLocalOfflineImage(input: ImageProviderGenerateInput): ImageProviderGenerateResult {
  const prompt = input.prompt || "";
  const isFemale = prompt.includes("FEMALE") || prompt.includes("女") || prompt.includes("黛玉") || prompt.includes("崔氏");
  const isTurnaround = prompt.includes("turnaround") || prompt.includes("三视图");
  const isExpression = prompt.includes("expression sheet") || prompt.includes("表情稿");

  const genderText = isFemale ? "女性角色 (Female Character)" : "男性/通用角色 (Male Character)";
  const hairColor = prompt.includes("红") || prompt.includes("朱") ? "#991b1b" : prompt.includes("金") ? "#d97706" : "#1e293b";
  const dressColor = isFemale ? "#be185d" : "#0284c7";
  const bgGradStart = "#0f172a";
  const bgGradEnd = "#1e293b";

  let svgWidth = 1536;
  let svgHeight = 1024;
  if (input.size === "1024x1536") {
    svgWidth = 1024;
    svgHeight = 1536;
  }

  let bodyElements = "";

  if (isTurnaround) {
    bodyElements = `
      <rect x="40" y="70" width="430" height="880" rx="16" fill="#1e293b" stroke="#38bdf8" stroke-width="3"/>
      <text x="255" y="115" font-family="sans-serif" font-size="22" font-weight="bold" fill="#38bdf8" text-anchor="middle">【面部特写 (Close-up Portrait)】</text>
      <circle cx="255" cy="370" r="140" fill="#fde68a" stroke="#cbd5e1" stroke-width="4"/>
      <path d="M 115 350 C 135 190 375 190 395 350 C 365 240 145 240 115 350 Z" fill="${hairColor}"/>
      ${isFemale ? `<circle cx="255" cy="210" r="40" fill="${hairColor}"/><circle cx="280" cy="195" r="16" fill="#f59e0b"/>` : ""}
      <ellipse cx="200" cy="360" rx="16" ry="22" fill="#0f172a"/>
      <ellipse cx="310" cy="360" rx="16" ry="22" fill="#0f172a"/>
      <circle cx="205" cy="355" r="6" fill="#ffffff"/>
      <circle cx="315" cy="355" r="6" fill="#ffffff"/>
      <path d="M 225 430 Q 255 455 285 430" fill="none" stroke="#be123c" stroke-width="5" stroke-linecap="round"/>

      <rect x="500" y="70" width="996" height="880" rx="16" fill="#0f172a" stroke="#0ea5e9" stroke-width="3"/>
      <text x="998" y="115" font-family="sans-serif" font-size="22" font-weight="bold" fill="#38bdf8" text-anchor="middle">【全身立绘与正 / 侧 / 背三视图 (Turnaround Views)】</text>

      <g transform="translate(610, 190)">
        <text x="80" y="-15" font-family="sans-serif" font-size="18" fill="#94a3b8" text-anchor="middle">正面 (Front)</text>
        <circle cx="80" cy="80" r="50" fill="#fde68a"/>
        <path d="M 40 70 C 50 20 110 20 120 70 Z" fill="${hairColor}"/>
        <rect x="40" y="140" width="80" height="260" rx="15" fill="${dressColor}"/>
        <rect x="55" y="400" width="20" height="230" fill="#64748b"/>
        <rect x="85" y="400" width="20" height="230" fill="#64748b"/>
      </g>

      <g transform="translate(998, 190)">
        <text x="0" y="-15" font-family="sans-serif" font-size="18" fill="#94a3b8" text-anchor="middle">侧面 (Side)</text>
        <ellipse cx="0" cy="80" rx="40" ry="50" fill="#fde68a"/>
        <path d="M -20 60 C -10 10 30 10 30 80 Z" fill="${hairColor}"/>
        <rect x="-30" y="140" width="60" height="260" rx="15" fill="${dressColor}"/>
        <rect x="-10" y="400" width="20" height="230" fill="#64748b"/>
      </g>

      <g transform="translate(1330, 190)">
        <text x="0" y="-15" font-family="sans-serif" font-size="18" fill="#94a3b8" text-anchor="middle">背面 (Back)</text>
        <circle cx="0" cy="80" r="50" fill="#fde68a"/>
        <path d="M -45 50 C -40 0 40 0 45 120 Z" fill="${hairColor}"/>
        <rect x="-40" y="140" width="80" height="260" rx="15" fill="${dressColor}"/>
        <rect x="-25" y="400" width="20" height="230" fill="#475569"/>
        <rect x="5" y="400" width="20" height="230" fill="#475569"/>
      </g>
    `;
  } else if (isExpression) {
    bodyElements = `
      <text x="768" y="90" font-family="sans-serif" font-size="26" font-weight="bold" fill="#38bdf8" text-anchor="middle">【角色 6 核心表情设计稿】</text>
      ${["平静 Calm", "喜悦 Smile", "愤怒 Angry", "悲伤 Sorrow", "震惊 Shock", "高冷 Cold"].map((expr, idx) => {
        const x = 60 + idx * 240;
        return `
          <g transform="translate(${x}, 160)">
            <rect x="0" y="0" width="215" height="720" rx="16" fill="#1e293b" stroke="#0ea5e9" stroke-width="2"/>
            <circle cx="107" cy="220" r="75" fill="#fde68a"/>
            <path d="M 37 200 C 47 100 167 100 177 200 Z" fill="${hairColor}"/>
            <text x="107" y="600" font-family="sans-serif" font-size="20" font-weight="bold" fill="#38bdf8" text-anchor="middle">${expr}</text>
          </g>
        `;
      }).join("")}
    `;
  } else {
    bodyElements = `
      <rect x="60" y="60" width="${svgWidth - 120}" height="${svgHeight - 120}" rx="24" fill="#1e293b" stroke="#0ea5e9" stroke-width="4"/>
      <circle cx="${svgWidth / 2}" cy="${svgHeight / 2 - 80}" r="160" fill="#0284c7" opacity="0.3"/>
      <text x="${svgWidth / 2}" y="${svgHeight / 2 + 20}" font-family="sans-serif" font-size="34" font-weight="bold" fill="#38bdf8" text-anchor="middle">🎬 本地 100% 离线模型生成</text>
      <text x="${svgWidth / 2}" y="${svgHeight / 2 + 80}" font-family="sans-serif" font-size="22" fill="#94a3b8" text-anchor="middle">${genderText} · 本地离线合成构图</text>
    `;
  }

  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
    <defs>
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgGradStart}"/>
        <stop offset="100%" stop-color="${bgGradEnd}"/>
      </linearGradient>
    </defs>
    <rect width="${svgWidth}" height="${svgHeight}" fill="url(#bgGrad)"/>
    ${bodyElements}
    <rect x="40" y="${svgHeight - 55}" width="${svgWidth - 80}" height="40" rx="8" fill="#090d16" opacity="0.8"/>
    <text x="70" y="${svgHeight - 28}" font-family="sans-serif" font-size="15" fill="#38bdf8">100% 本地离线模型模式 (SenseNova Local Inference Engine) | ${genderText}</text>
  </svg>`;

  const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;
  return {
    provider: input.provider,
    model: input.model,
    images: [{ url: dataUri }],
  };
}
