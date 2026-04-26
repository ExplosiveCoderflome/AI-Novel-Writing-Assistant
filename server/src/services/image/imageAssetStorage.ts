import { Readable } from "node:stream";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { S3Client } from "@aws-sdk/client-s3";
import { imageStorageConfig, isS3ImageStorageEnabled } from "../../config/imageStorage";
import { AppError } from "../../middleware/errorHandler";
import { resolveGeneratedImagesRoot } from "../../runtime/appPaths";
import {
  deleteImageObject,
  normalizeStorageKey,
  putImageObject,
  resolveImageObject,
} from "./objectImageStorage";

interface ParsedAssetMetadata {
  localPath: string | null;
  sourceUrl: string | null;
  relativePath: string | null;
  storageKey: string | null;
  storageDriver: "local" | "s3" | null;
}

interface PersistGeneratedImageInput {
  taskId: string;
  sceneType: "character";
  baseCharacterId?: string | null;
  sortOrder: number;
  url: string;
  mimeType?: string | null;
  storageRoot?: string;
  fetchImpl?: typeof fetch;
  s3Client?: Pick<S3Client, "send">;
}

interface PersistedGeneratedImage {
  persistedUrl: string;
  localPath: string | null;
  relativePath: string | null;
  storageKey: string | null;
  storageDriver: "local" | "s3";
  sourceUrl: string | null;
  mimeType: string;
}

interface ImageAssetFileInput {
  assetId: string;
  url: string;
  mimeType?: string | null;
  metadata?: string | null;
  s3Client?: Pick<S3Client, "send">;
}

interface ResolvedImageAssetFile {
  localPath?: string;
  stream?: Readable;
  mimeType: string | null;
}

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "asset";
}

function detectMimeTypeFromDataUrl(url: string): string | null {
  const match = /^data:([^;,]+);base64,/i.exec(url);
  return match?.[1]?.trim().toLowerCase() ?? null;
}

function getExtensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase();
  return MIME_EXTENSION_MAP[normalized] ?? "png";
}

function getExtensionFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const extension = path.extname(pathname).replace(".", "").trim().toLowerCase();
    return extension || null;
  } catch {
    return null;
  }
}

async function readImageBuffer(input: {
  url: string;
  mimeType?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<{ buffer: Buffer; mimeType: string; sourceUrl: string | null }> {
  if (input.url.startsWith("data:")) {
    const mimeType = detectMimeTypeFromDataUrl(input.url) ?? input.mimeType?.trim().toLowerCase() ?? "image/png";
    const [, base64Payload = ""] = input.url.split(",", 2);
    return {
      buffer: Buffer.from(base64Payload, "base64"),
      mimeType,
      sourceUrl: null,
    };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetchImpl(input.url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to download generated image (${response.status}).`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: contentType || input.mimeType?.trim().toLowerCase() || "image/png",
      sourceUrl: input.url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildStorageSegments(input: PersistGeneratedImageInput, extension: string): {
  relativePath: string;
  localPath: string;
} {
  const storageRoot = input.storageRoot ?? resolveGeneratedImagesRoot();
  const characterSegment = sanitizeSegment(input.baseCharacterId ?? input.taskId);
  const taskSegment = sanitizeSegment(input.taskId);
  const fileName = `image-${String(input.sortOrder + 1).padStart(2, "0")}.${extension}`;
  const localPath = path.join(storageRoot, `${input.sceneType}s`, characterSegment, taskSegment, fileName);
  return {
    relativePath: path.relative(storageRoot, localPath).split(path.sep).join("/"),
    localPath,
  };
}

export function buildImageAssetPublicUrl(assetId: string): string {
  return `/api/images/assets/${assetId}/file`;
}

export function parseImageAssetMetadata(metadata: string | null | undefined): ParsedAssetMetadata {
  if (!metadata?.trim()) {
    return {
      localPath: null,
      sourceUrl: null,
      relativePath: null,
      storageKey: null,
      storageDriver: null,
    };
  }

  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    return {
      localPath: typeof parsed.localPath === "string" && parsed.localPath.trim() ? parsed.localPath : null,
      sourceUrl: typeof parsed.sourceUrl === "string" && parsed.sourceUrl.trim() ? parsed.sourceUrl : null,
      relativePath: typeof parsed.relativePath === "string" && parsed.relativePath.trim() ? parsed.relativePath : null,
      storageKey: typeof parsed.storageKey === "string" && parsed.storageKey.trim() ? parsed.storageKey : null,
      storageDriver: parsed.storageDriver === "s3" || parsed.storageDriver === "local" ? parsed.storageDriver : null,
    };
  } catch {
    return {
      localPath: null,
      sourceUrl: null,
      relativePath: null,
      storageKey: null,
      storageDriver: null,
    };
  }
}

export async function persistGeneratedImageAsset(input: PersistGeneratedImageInput): Promise<PersistedGeneratedImage> {
  const image = await readImageBuffer({
    url: input.url,
    mimeType: input.mimeType,
    fetchImpl: input.fetchImpl,
  });
  const inferredExtension = getExtensionFromUrl(input.url);
  const extension = inferredExtension || getExtensionFromMimeType(image.mimeType);
  const { localPath, relativePath } = buildStorageSegments(input, extension);

  if (isS3ImageStorageEnabled()) {
    const storageKey = normalizeStorageKey(relativePath);
    if (!storageKey) {
      throw new AppError("Image object storage key is invalid.", 500);
    }
    await putImageObject({
      buffer: image.buffer,
      key: storageKey,
      mimeType: image.mimeType,
      s3Client: input.s3Client,
    });
    return {
      persistedUrl: storageKey,
      localPath: null,
      relativePath,
      storageKey,
      storageDriver: "s3",
      sourceUrl: image.sourceUrl,
      mimeType: image.mimeType,
    };
  }

  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, image.buffer);

  return {
    persistedUrl: localPath,
    localPath,
    relativePath,
    storageKey: null,
    storageDriver: "local",
    sourceUrl: image.sourceUrl,
    mimeType: image.mimeType,
  };
}

export async function resolveImageAssetFile(input: ImageAssetFileInput): Promise<ResolvedImageAssetFile> {
  const metadata = parseImageAssetMetadata(input.metadata);
  if (metadata.storageDriver === "s3" || (!metadata.localPath && metadata.storageKey)) {
    const resolved = await resolveImageObject({
      key: metadata.storageKey ?? input.url,
      s3Client: input.s3Client,
    });
    return {
      stream: resolved.stream,
      mimeType: resolved.mimeType ?? input.mimeType ?? null,
    };
  }

  const localPath = metadata.localPath
    ?? (path.isAbsolute(input.url) ? input.url : null);

  if (!localPath) {
    throw new AppError("Image asset is not stored locally yet.", 404);
  }

  try {
    await fs.access(localPath);
  } catch {
    throw new AppError("Local image asset file was not found.", 404);
  }

  return { localPath, mimeType: input.mimeType ?? null };
}

export async function resolveLocalImageAssetFile(input: ImageAssetFileInput): Promise<{ localPath: string }> {
  const resolved = await resolveImageAssetFile(input);
  if (!resolved.localPath) {
    throw new AppError("Image asset is not stored locally yet.", 404);
  }
  return { localPath: resolved.localPath };
}

export async function removeStoredImageAssetFile(input: {
  assetId?: string;
  url: string;
  metadata?: string | null;
  storageRoot?: string;
  s3Client?: Pick<S3Client, "send">;
}): Promise<void> {
  const metadata = parseImageAssetMetadata(input.metadata);
  if (metadata.storageDriver === "s3" || metadata.storageKey) {
    await deleteImageObject({
      key: metadata.storageKey ?? input.url,
      s3Client: input.s3Client,
    });
    return;
  }
  await removeLocalImageAssetFile(input);
}

export async function removeLocalImageAssetFile(input: {
  assetId?: string;
  url: string;
  metadata?: string | null;
  storageRoot?: string;
}): Promise<void> {
  const metadata = parseImageAssetMetadata(input.metadata);
  const localPath = metadata.localPath
    ?? (path.isAbsolute(input.url) ? input.url : null);

  if (!localPath) {
    return;
  }

  try {
    await fs.unlink(localPath);
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError?.code !== "ENOENT") {
      throw error;
    }
  }

  const storageRoot = input.storageRoot ?? resolveGeneratedImagesRoot();
  let currentDirectory = path.dirname(localPath);
  const normalizedStorageRoot = path.resolve(storageRoot);

  while (currentDirectory.startsWith(normalizedStorageRoot) && currentDirectory !== normalizedStorageRoot) {
    try {
      await fs.rmdir(currentDirectory);
      currentDirectory = path.dirname(currentDirectory);
    } catch (error) {
      const fsError = error as NodeJS.ErrnoException;
      if (fsError?.code === "ENOTEMPTY" || fsError?.code === "ENOENT") {
        break;
      }
      throw error;
    }
  }
}

export { imageStorageConfig };
