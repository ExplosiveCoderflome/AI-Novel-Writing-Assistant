function isEnabled(rawValue: string | undefined, defaultValue: boolean): boolean {
  if (!rawValue) {
    return defaultValue;
  }
  const normalized = rawValue.trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(normalized);
}

function readDriver(rawValue: string | undefined): "local" | "s3" {
  const normalized = (rawValue ?? "local").trim().toLowerCase();
  if (normalized === "local" || normalized === "s3") {
    return normalized;
  }
  throw new Error(`Unsupported IMAGE_STORAGE_DRIVER: ${rawValue ?? ""}`);
}

export const imageStorageConfig = {
  driver: readDriver(process.env.IMAGE_STORAGE_DRIVER),
  localRoot: process.env.IMAGE_STORAGE_ROOT?.trim() || "storage/generated-images",
  s3Endpoint: process.env.IMAGE_STORAGE_S3_ENDPOINT?.trim() || "",
  s3Region: process.env.IMAGE_STORAGE_S3_REGION?.trim() || "us-east-1",
  s3Bucket: process.env.IMAGE_STORAGE_S3_BUCKET?.trim() || "",
  s3AccessKeyId: process.env.IMAGE_STORAGE_S3_ACCESS_KEY_ID?.trim() || "",
  s3SecretAccessKey: process.env.IMAGE_STORAGE_S3_SECRET_ACCESS_KEY?.trim() || "",
  s3ForcePathStyle: isEnabled(process.env.IMAGE_STORAGE_S3_FORCE_PATH_STYLE, true),
};

export function isS3ImageStorageEnabled(): boolean {
  return imageStorageConfig.driver === "s3";
}

export function getImageStorageRoot(): string {
  return imageStorageConfig.localRoot;
}
