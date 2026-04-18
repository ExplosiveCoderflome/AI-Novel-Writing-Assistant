import { promises as fs } from "node:fs";
import path from "node:path";
import { AppError } from "../../middleware/errorHandler";

interface ParsedAssetMetadata {
  localPath: string | null;
  sourceUrl: string | null;
  relativePath: string | null;
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
}

interface PersistedGeneratedImage {
  localPath: string;
  relativePath: string;
  sourceUrl: string | null;
  mimeType: string;
}

const DEFAULT_STORAGE_ROOT = path.resolve(process.cwd(), "storage", "generated-images");

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

export function buildImageAssetPublicUrl(assetId: string): string {
  return `/api/images/assets/${assetId}/file`;
}

export function parseImageAssetMetadata(metadata: string | null | undefined): ParsedAssetMetadata {
  if (!metadata?.trim()) {
    return {
      localPath: null,
      sourceUrl: null,
      relativePath: null,
    };
  }

  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    return {
      localPath: typeof parsed.localPath === "string" && parsed.localPath.trim() ? parsed.localPath : null,
      sourceUrl: typeof parsed.sourceUrl === "string" && parsed.sourceUrl.trim() ? parsed.sourceUrl : null,
      relativePath: typeof parsed.relativePath === "string" && parsed.relativePath.trim() ? parsed.relativePath : null,
    };
  } catch {
    return {
      localPath: null,
      sourceUrl: null,
      relativePath: null,
    };
  }
}

export async function persistGeneratedImageAsset(input: PersistGeneratedImageInput): Promise<PersistedGeneratedImage> {
  const storageRoot = input.storageRoot ?? DEFAULT_STORAGE_ROOT;
  const image = await readImageBuffer({
    url: input.url,
    mimeType: input.mimeType,
    fetchImpl: input.fetchImpl,
  });
  const inferredExtension = getExtensionFromUrl(input.url);
  const extension = inferredExtension || getExtensionFromMimeType(image.mimeType);
  const characterSegment = sanitizeSegment(input.baseCharacterId ?? input.taskId);
  const taskSegment = sanitizeSegment(input.taskId);
  const fileName = `image-${String(input.sortOrder + 1).padStart(2, "0")}.${extension}`;
  const directory = path.join(storageRoot, `${input.sceneType}s`, characterSegment, taskSegment);
  const localPath = path.join(directory, fileName);
  const relativePath = path.relative(storageRoot, localPath).split(path.sep).join("/");

  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(localPath, image.buffer);

  return {
    localPath,
    relativePath,
    sourceUrl: image.sourceUrl,
    mimeType: image.mimeType,
  };
}

export async function resolveLocalImageAssetFile(input: {
  assetId: string;
  url: string;
  metadata?: string | null;
}): Promise<{ localPath: string }> {
  const metadata = parseImageAssetMetadata(input.metadata);
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

  return { localPath };
}

export async function removeLocalImageAssetFile(input: {
  assetId: string;
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

  const storageRoot = input.storageRoot ?? DEFAULT_STORAGE_ROOT;
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
