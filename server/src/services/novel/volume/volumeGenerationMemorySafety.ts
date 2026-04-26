import type { VolumeGenerateOptions } from "./volumeModels";
import { normalizeScope } from "./volumeGenerationHelpers";

const HIGH_MEMORY_VOLUME_SCOPES = new Set([
  "beat_sheet",
  "chapter_list",
  "rebalance",
  "chapter_detail",
  "volume",
]);

export function isHighMemoryVolumeGeneration(options: Pick<VolumeGenerateOptions, "scope">): boolean {
  return HIGH_MEMORY_VOLUME_SCOPES.has(normalizeScope(options.scope));
}

export function resolveHighMemoryVolumeGenerationKey(
  novelId: string,
  options: Pick<VolumeGenerateOptions, "scope" | "targetVolumeId" | "targetChapterId">,
): string | null {
  if (!isHighMemoryVolumeGeneration(options)) {
    return null;
  }
  const normalizedNovelId = novelId.trim();
  if (!normalizedNovelId) {
    return null;
  }
  const target = options.targetChapterId?.trim()
    ? `chapter:${options.targetChapterId.trim()}`
    : options.targetVolumeId?.trim()
      ? `volume:${options.targetVolumeId.trim()}`
      : "book";
  return `${normalizedNovelId}:${target}`;
}
