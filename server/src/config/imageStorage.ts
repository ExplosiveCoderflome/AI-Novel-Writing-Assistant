export type ImageStorageDriver = "local" | "s3";

function normalizeImageStorageDriver(rawValue: string | undefined): ImageStorageDriver {
  const normalized = rawValue?.trim().toLowerCase();
  if (!normalized || normalized === "local") {
    return "local";
  }
  if (normalized === "s3" || normalized === "minio") {
    return "s3";
  }
  throw new Error(`Unsupported IMAGE_STORAGE_DRIVER: ${rawValue ?? ""}`);
}

function isEnabled(rawValue: string | undefined, defaultValue: boolean): boolean {
  if (!rawValue?.trim()) {
    return defaultValue;
  }
  return !["0", "false", "off", "no"].includes(rawValue.trim().toLowerCase());
}

export const imageStorageConfig = {
  driver: normalizeImageStorageDriver(process.env.IMAGE_STORAGE_DRIVER),
  localRoot: process.env.IMAGE_STORAGE_ROOT?.trim() || "storage/generated-images",
  s3Endpoint: process.env.IMAGE_STORAGE_S3_ENDPOINT?.trim() || process.env.MINIO_ENDPOINT?.trim() || "",
  s3Region: process.env.IMAGE_STORAGE_S3_REGION?.trim() || process.env.MINIO_REGION?.trim() || "us-east-1",
  s3Bucket: process.env.IMAGE_STORAGE_S3_BUCKET?.trim() || process.env.MINIO_BUCKET?.trim() || "",
  s3AccessKeyId:
    process.env.IMAGE_STORAGE_S3_ACCESS_KEY_ID?.trim() || process.env.MINIO_ACCESS_KEY?.trim() || "",
  s3SecretAccessKey:
    process.env.IMAGE_STORAGE_S3_SECRET_ACCESS_KEY?.trim() || process.env.MINIO_SECRET_KEY?.trim() || "",
  s3ForcePathStyle: isEnabled(process.env.IMAGE_STORAGE_S3_FORCE_PATH_STYLE ?? process.env.MINIO_FORCE_PATH_STYLE, true),
};

export function isS3ImageStorageEnabled(): boolean {
  return imageStorageConfig.driver === "s3";
}
