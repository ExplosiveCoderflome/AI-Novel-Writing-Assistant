import { Readable } from "node:stream";
import { promises as fs } from "node:fs";
import { lookup } from "node:dns/promises";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { imageStorageConfig, isS3ImageStorageEnabled } from "../../config/imageStorage";
import { AppError } from "../../middleware/errorHandler";

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

interface ResolvedImageAssetFile {
  mimeType: string | null;
  localPath?: string;
  stream?: Readable;
}

const DEFAULT_STORAGE_ROOT = path.resolve(process.cwd(), imageStorageConfig.localRoot);
const LEGACY_STORAGE_ROOT = path.resolve(process.cwd(), "storage", "generated-images");

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const ALLOWED_IMAGE_MIME_TYPES = new Set(Object.keys(MIME_EXTENSION_MAP));
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

let cachedS3Client: S3Client | null = null;

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "asset";
}

function detectMimeTypeFromDataUrl(url: string): string | null {
  const match = /^data:([^;,]+);base64,/i.exec(url);
  return match?.[1]?.trim().toLowerCase() ?? null;
}

function normalizeHostForChecks(hostname: string): string {
  return hostname.trim().replace(/^\[|\]$/g, "").toLowerCase();
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = normalizeHostForChecks(hostname);
  if (!normalized) {
    return true;
  }
  if (normalized === "localhost") {
    return true;
  }
  if (normalized.endsWith(".localhost") || normalized.endsWith(".local") || normalized.endsWith(".internal")) {
    return true;
  }
  if (net.isIP(normalized) === 4) {
    const [a, b] = normalized.split(".").map((segment) => Number(segment));
    return a === 10
      || a === 127
      || a === 0
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19))
      || a >= 224;
  }
  if (net.isIP(normalized) === 6) {
    const mappedIpv4Match = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(normalized);
    if (mappedIpv4Match) {
      return isPrivateHostname(mappedIpv4Match[1]);
    }
    return normalized === "::1"
      || normalized === "::"
      || normalized.startsWith("fc")
      || normalized.startsWith("fd")
      || normalized.startsWith("fe80:")
      || normalized.startsWith("fec0:")
      || normalized.startsWith("ff")
      || normalized.startsWith("2001:db8:");
  }
  return false;
}

async function assertSafeRemoteImageUrl(url: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError("Generated image URL is invalid.", 400);
  }
  if (parsed.protocol !== "https:") {
    throw new AppError("Generated image URL must use HTTPS.", 400);
  }
  if (parsed.username || parsed.password) {
    throw new AppError("Generated image URL must not include credentials.", 400);
  }
  if (isPrivateHostname(parsed.hostname)) {
    throw new AppError("Generated image URL points to a private network address.", 400);
  }
  return parsed;
}

function assertSupportedImageMimeType(mimeType: string): string {
  const normalized = mimeType.trim().toLowerCase();
  if (!ALLOWED_IMAGE_MIME_TYPES.has(normalized)) {
    throw new AppError(`Unsupported generated image MIME type: ${mimeType}`, 400);
  }
  return normalized;
}

function extractContentLength(header: string | string[] | undefined): number | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function assertImageBufferSize(buffer: Buffer): void {
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new AppError("Generated image exceeds maximum allowed size.", 400);
  }
}

function assertImageBufferMatchesMimeType(buffer: Buffer, mimeType: string): void {
  const matches = mimeType === "image/png"
    ? buffer.byteLength >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : mimeType === "image/jpeg" || mimeType === "image/jpg"
      ? buffer.byteLength >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
      : mimeType === "image/gif"
        ? buffer.byteLength >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))
        : mimeType === "image/webp"
          ? buffer.byteLength >= 12
            && buffer.subarray(0, 4).toString("ascii") === "RIFF"
            && buffer.subarray(8, 12).toString("ascii") === "WEBP"
          : false;
  if (!matches) {
    throw new AppError("Generated image payload does not match declared image MIME type.", 400);
  }
}

function isPathInsideRoot(root: string, target: string): boolean {
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(target);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
}

function getCanonicalLocalPath(url: string): string | null {
  if (!path.isAbsolute(url)) {
    return null;
  }
  const resolved = path.resolve(url);
  if (!isPathInsideRoot(DEFAULT_STORAGE_ROOT, resolved) && !isPathInsideRoot(LEGACY_STORAGE_ROOT, resolved)) {
    throw new AppError("Local image asset file was not found.", 404);
  }
  return resolved;
}

function isCanonicalStorageKey(url: string): boolean {
  const trimmed = url.trim();
  return Boolean(
    trimmed
      && !path.isAbsolute(trimmed)
      && !/^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      && /^[a-z_]+s\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/image-\d+\.(png|jpe?g|webp|gif)$/i.test(trimmed),
  );
}

function getCanonicalStorageKey(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed || path.isAbsolute(trimmed) || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return null;
  }
  if (!isCanonicalStorageKey(trimmed)) {
    throw new AppError("Stored image asset file was not found.", 404);
  }
  return trimmed;
}

async function downloadRemoteImage(url: URL, fallbackMimeType?: string | null): Promise<{ buffer: Buffer; mimeType: string }> {
  const hostname = normalizeHostForChecks(url.hostname);
  let addresses;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new AppError("Failed to resolve generated image URL host.", 400);
  }
  const publicAddresses = addresses.filter((entry) => !isPrivateHostname(entry.address));
  if (publicAddresses.length === 0) {
    throw new AppError("Generated image URL points to a private network address.", 400);
  }

  const requestHeaders: Record<string, string> = {
    Host: url.host,
  };
  const pathname = `${url.pathname}${url.search}` || "/";
  let lastError: unknown = null;

  for (const { address } of publicAddresses) {
    try {
      return await new Promise<{ buffer: Buffer; mimeType: string }>((resolve, reject) => {
        const request = https.request({
          protocol: "https:",
          hostname: address,
          servername: hostname,
          family: net.isIP(address),
          port: url.port ? Number(url.port) : 443,
          path: pathname,
          method: "GET",
          headers: requestHeaders,
          timeout: 30_000,
        }, (response) => {
          const statusCode = response.statusCode ?? 0;
          if (statusCode < 200 || statusCode >= 300) {
            response.resume();
            reject(new Error(`Failed to download generated image (${statusCode}).`));
            return;
          }
          const contentLength = extractContentLength(response.headers["content-length"]);
          if (contentLength !== null && contentLength > MAX_IMAGE_BYTES) {
            response.resume();
            reject(new AppError("Generated image exceeds maximum allowed size.", 400));
            return;
          }
          const contentTypeHeader = response.headers["content-type"];
          const contentType = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader;
          let mimeType: string;
          try {
            mimeType = assertSupportedImageMimeType(
              contentType?.split(";")[0]?.trim().toLowerCase() || fallbackMimeType?.trim().toLowerCase() || "image/png",
            );
          } catch (error) {
            response.resume();
            reject(error);
            return;
          }
          const chunks: Buffer[] = [];
          let totalBytes = 0;
          response.on("data", (chunk: Buffer | string) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            totalBytes += buffer.length;
            if (totalBytes > MAX_IMAGE_BYTES) {
              request.destroy(new AppError("Generated image exceeds maximum allowed size.", 400));
              return;
            }
            chunks.push(buffer);
          });
          response.on("end", () => {
            const buffer = Buffer.concat(chunks);
            try {
              assertImageBufferMatchesMimeType(buffer, mimeType);
            } catch (error) {
              reject(error);
              return;
            }
            resolve({
              buffer,
              mimeType,
            });
          });
          response.on("error", reject);
        });

        request.on("timeout", () => {
          request.destroy(new AppError("Timed out while downloading generated image.", 400));
        });
        request.on("error", reject);
        request.end();
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      lastError = error;
    }
  }

  throw new AppError(lastError instanceof Error ? lastError.message : "Failed to download generated image.", 400);
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

function buildRelativePath(input: {
  sceneType: "character";
  baseCharacterId?: string | null;
  taskId: string;
  sortOrder: number;
  extension: string;
}): string {
  const characterSegment = sanitizeSegment(input.baseCharacterId ?? input.taskId);
  const taskSegment = sanitizeSegment(input.taskId);
  const fileName = `image-${String(input.sortOrder + 1).padStart(2, "0")}.${input.extension}`;
  return path.posix.join(`${input.sceneType}s`, characterSegment, taskSegment, fileName);
}

async function readImageBuffer(input: {
  url: string;
  mimeType?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<{ buffer: Buffer; mimeType: string; sourceUrl: string | null }> {
  if (input.url.startsWith("data:")) {
    const mimeType = assertSupportedImageMimeType(
      detectMimeTypeFromDataUrl(input.url) ?? input.mimeType?.trim().toLowerCase() ?? "image/png",
    );
    const [, base64Payload = ""] = input.url.split(",", 2);
    const buffer = Buffer.from(base64Payload, "base64");
    assertImageBufferSize(buffer);
    assertImageBufferMatchesMimeType(buffer, mimeType);
    return {
      buffer,
      mimeType,
      sourceUrl: null,
    };
  }

  if (input.fetchImpl) {
    const safeUrl = await assertSafeRemoteImageUrl(input.url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await input.fetchImpl(safeUrl, {
        signal: controller.signal,
        redirect: "error",
      });
      if (!response.ok) {
        throw new Error(`Failed to download generated image (${response.status}).`);
      }
      const contentLength = extractContentLength(response.headers.get("content-length") ?? undefined);
      if (contentLength !== null && contentLength > MAX_IMAGE_BYTES) {
        throw new AppError("Generated image exceeds maximum allowed size.", 400);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      assertImageBufferSize(buffer);
      const contentType = assertSupportedImageMimeType(
        response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || input.mimeType?.trim().toLowerCase() || "image/png",
      );
      assertImageBufferMatchesMimeType(buffer, contentType);
      return {
        buffer,
        mimeType: contentType,
        sourceUrl: safeUrl.toString(),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  const safeUrl = await assertSafeRemoteImageUrl(input.url);
  const downloaded = await downloadRemoteImage(safeUrl, input.mimeType);
  return {
    buffer: downloaded.buffer,
    mimeType: downloaded.mimeType,
    sourceUrl: safeUrl.toString(),
  };
}

function toReadableBody(body: unknown): Readable | null {
  if (body instanceof Readable) {
    return body;
  }
  if (typeof body === "object" && body !== null && Symbol.asyncIterator in body) {
    return Readable.from(body as AsyncIterable<Uint8Array>);
  }
  return null;
}

function getS3Client(): S3Client {
  if (cachedS3Client) {
    return cachedS3Client;
  }
  cachedS3Client = new S3Client({
    region: imageStorageConfig.s3Region,
    endpoint: imageStorageConfig.s3Endpoint || undefined,
    forcePathStyle: imageStorageConfig.s3ForcePathStyle,
    credentials: imageStorageConfig.s3AccessKeyId && imageStorageConfig.s3SecretAccessKey
      ? {
        accessKeyId: imageStorageConfig.s3AccessKeyId,
        secretAccessKey: imageStorageConfig.s3SecretAccessKey,
      }
      : undefined,
  });
  return cachedS3Client;
}

function assertS3StorageConfigured(): void {
  if (!imageStorageConfig.s3Bucket) {
    throw new AppError("Image storage bucket is not configured.", 500);
  }
}

async function persistImageToLocal(input: {
  relativePath: string;
  storageRoot: string;
  image: { buffer: Buffer; mimeType: string; sourceUrl: string | null };
}): Promise<PersistedGeneratedImage> {
  const localPath = path.join(input.storageRoot, input.relativePath.split("/").join(path.sep));
  await fs.mkdir(path.dirname(localPath), { recursive: true });
  await fs.writeFile(localPath, input.image.buffer);
  return {
    persistedUrl: localPath,
    localPath,
    relativePath: input.relativePath,
    storageKey: null,
    storageDriver: "local",
    sourceUrl: input.image.sourceUrl,
    mimeType: input.image.mimeType,
  };
}

async function persistImageToS3(input: {
  relativePath: string;
  image: { buffer: Buffer; mimeType: string; sourceUrl: string | null };
  s3Client?: Pick<S3Client, "send">;
}): Promise<PersistedGeneratedImage> {
  assertS3StorageConfigured();
  const key = input.relativePath;
  const client = input.s3Client ?? getS3Client();
  await client.send(new PutObjectCommand({
    Bucket: imageStorageConfig.s3Bucket,
    Key: key,
    Body: input.image.buffer,
    ContentType: input.image.mimeType,
  }));
  return {
    persistedUrl: key,
    localPath: null,
    relativePath: input.relativePath,
    storageKey: key,
    storageDriver: "s3",
    sourceUrl: input.image.sourceUrl,
    mimeType: input.image.mimeType,
  };
}

async function resolveS3ImageAssetFile(input: {
  storageKey: string;
  mimeType?: string | null;
  s3Client?: Pick<S3Client, "send">;
}): Promise<ResolvedImageAssetFile> {
  assertS3StorageConfigured();
  const client = input.s3Client ?? getS3Client();
  try {
    const result = await client.send(new GetObjectCommand({
      Bucket: imageStorageConfig.s3Bucket,
      Key: input.storageKey,
    }));
    const body = toReadableBody(result.Body);
    if (!body) {
      throw new AppError("Stored image object body is unreadable.", 500);
    }
    return {
      stream: body,
      mimeType: result.ContentType?.split(";")[0]?.trim().toLowerCase() ?? input.mimeType ?? null,
    };
  } catch (error) {
    if (error instanceof S3ServiceException && error.name === "NoSuchKey") {
      throw new AppError("Stored image asset file was not found.", 404);
    }
    throw error;
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
      storageKey: null,
      storageDriver: null,
    };
  }

  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    const storageDriver = parsed.storageDriver === "s3" || parsed.storageDriver === "local"
      ? parsed.storageDriver
      : null;
    return {
      localPath: typeof parsed.localPath === "string" && parsed.localPath.trim() ? parsed.localPath : null,
      sourceUrl: typeof parsed.sourceUrl === "string" && parsed.sourceUrl.trim() ? parsed.sourceUrl : null,
      relativePath: typeof parsed.relativePath === "string" && parsed.relativePath.trim() ? parsed.relativePath : null,
      storageKey: typeof parsed.storageKey === "string" && parsed.storageKey.trim() ? parsed.storageKey : null,
      storageDriver,
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
  const storageRoot = input.storageRoot ?? DEFAULT_STORAGE_ROOT;
  const image = await readImageBuffer({
    url: input.url,
    mimeType: input.mimeType,
    fetchImpl: input.fetchImpl,
  });
  const extension = getExtensionFromMimeType(image.mimeType);
  const relativePath = buildRelativePath({
    sceneType: input.sceneType,
    baseCharacterId: input.baseCharacterId,
    taskId: input.taskId,
    sortOrder: input.sortOrder,
    extension,
  });

  if (isS3ImageStorageEnabled()) {
    return persistImageToS3({
      relativePath,
      image,
      s3Client: input.s3Client,
    });
  }

  return persistImageToLocal({
    relativePath,
    storageRoot,
    image,
  });
}

export async function resolveImageAssetFile(input: {
  assetId: string;
  url: string;
  mimeType?: string | null;
  metadata?: string | null;
  s3Client?: Pick<S3Client, "send">;
}): Promise<ResolvedImageAssetFile> {
  const storageDriver = path.isAbsolute(input.url)
    ? "local"
    : isCanonicalStorageKey(input.url)
      ? "s3"
      : null;

  if (storageDriver === "local") {
    const localPath = getCanonicalLocalPath(input.url);
    if (!localPath) {
      throw new AppError("Local image asset file was not found.", 404);
    }
    try {
      await fs.access(localPath);
      return {
        localPath,
        mimeType: input.mimeType ?? null,
      };
    } catch {
      throw new AppError("Local image asset file was not found.", 404);
    }
  }

  if (storageDriver === "s3") {
    const storageKey = getCanonicalStorageKey(input.url);
    if (!storageKey) {
      throw new AppError("Stored image asset file was not found.", 404);
    }
    return resolveS3ImageAssetFile({
      storageKey,
      mimeType: input.mimeType,
      s3Client: input.s3Client,
    });
  }

  throw new AppError("Image asset is not stored locally yet.", 404);
}
