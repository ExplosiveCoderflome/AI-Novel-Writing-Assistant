import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { imageStorageConfig } from "../../config/imageStorage";
import { AppError } from "../../middleware/errorHandler";

interface StoredObjectInput {
  buffer: Buffer;
  key: string;
  mimeType: string;
  s3Client?: Pick<S3Client, "send">;
}

interface ResolveObjectInput {
  key: string;
  s3Client?: Pick<S3Client, "send">;
}

interface DeleteObjectInput {
  key: string;
  s3Client?: Pick<S3Client, "send">;
}

let cachedS3Client: S3Client | null = null;

function getBucket(): string {
  if (!imageStorageConfig.s3Bucket) {
    throw new AppError("Image object storage bucket is not configured.", 500);
  }
  return imageStorageConfig.s3Bucket;
}

function getS3Client(): S3Client {
  if (cachedS3Client) {
    return cachedS3Client;
  }
  cachedS3Client = new S3Client({
    endpoint: imageStorageConfig.s3Endpoint || undefined,
    region: imageStorageConfig.s3Region,
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

export function normalizeStorageKey(key: string | null | undefined): string | null {
  const normalized = key?.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.split("/").some((segment) => !segment)) {
    return null;
  }
  return normalized;
}

export async function putImageObject(input: StoredObjectInput): Promise<void> {
  const key = normalizeStorageKey(input.key);
  if (!key) {
    throw new AppError("Image object storage key is invalid.", 500);
  }
  await (input.s3Client ?? getS3Client()).send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: input.buffer,
    ContentType: input.mimeType,
  }));
}

export async function resolveImageObject(input: ResolveObjectInput): Promise<{ stream: Readable; mimeType: string | null }> {
  const key = normalizeStorageKey(input.key);
  if (!key) {
    throw new AppError("Stored image asset file was not found.", 404);
  }
  try {
    const result = await (input.s3Client ?? getS3Client()).send(new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
    }));
    if (!(result.Body instanceof Readable)) {
      throw new AppError("Stored image asset file was not found.", 404);
    }
    return {
      stream: result.Body,
      mimeType: result.ContentType ?? null,
    };
  } catch (error) {
    if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) {
      throw new AppError("Stored image asset file was not found.", 404);
    }
    throw error;
  }
}

export async function deleteImageObject(input: DeleteObjectInput): Promise<void> {
  const key = normalizeStorageKey(input.key);
  if (!key) {
    throw new AppError("Stored image asset file was not found.", 404);
  }
  await (input.s3Client ?? getS3Client()).send(new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: key,
  }));
}
