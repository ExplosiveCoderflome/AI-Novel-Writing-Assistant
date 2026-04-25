import { AppError } from "../../../middleware/errorHandler";
import { logMemoryUsage } from "../../../runtime/memoryTelemetry";
import type { VolumeGenerateOptions } from "./volumeModels";
import { resolveHighMemoryVolumeGenerationKey } from "./volumeGenerationMemorySafety";

export interface VolumeMemoryTelemetry {
  taskId?: string | null;
  stage?: string | null;
  itemKey?: string | null;
  scope?: string | null;
  entrypoint?: string | null;
  volumeId?: string | null;
  chapterId?: string | null;
}

const activeHighMemoryVolumeGenerations = new Map<string, {
  startedAt: number;
  entrypoint: string | null;
  scope: string | null;
}>();

export function resolveVolumeGenerationTelemetryStage(options: VolumeGenerateOptions): string {
  const scope = options.scope ?? "strategy";
  if (
    scope === "beat_sheet"
    || scope === "chapter_list"
    || scope === "chapter_detail"
    || scope === "rebalance"
    || scope === "volume"
  ) {
    return "structured_outline";
  }
  return "volume_strategy";
}

export function resolveVolumeGenerationTelemetryItemKey(options: VolumeGenerateOptions): string {
  const scope = options.scope ?? "strategy";
  if (scope === "volume") {
    return "chapter_list";
  }
  if (scope === "chapter_detail") {
    return "chapter_detail_bundle";
  }
  return scope;
}

export async function withHighMemoryVolumeGenerationGuard<T>(
  novelId: string,
  options: VolumeGenerateOptions,
  runner: () => Promise<T>,
): Promise<T> {
  const key = resolveHighMemoryVolumeGenerationKey(novelId, options);
  if (!key) {
    return runner();
  }

  const now = Date.now();
  const active = activeHighMemoryVolumeGenerations.get(key);
  if (active) {
    logMemoryUsage({
      event: "duplicate_blocked",
      component: "generateVolumes",
      novelId,
      taskId: options.taskId,
      stage: resolveVolumeGenerationTelemetryStage(options),
      itemKey: resolveVolumeGenerationTelemetryItemKey(options),
      scope: options.scope ?? active.scope,
      entrypoint: options.entrypoint,
      volumeId: options.targetVolumeId,
      chapterId: options.targetChapterId,
    });
    throw new AppError("当前小说已有高内存卷规划生成正在处理同一范围，请稍后再试。", 409);
  }

  activeHighMemoryVolumeGenerations.set(key, {
    startedAt: now,
    entrypoint: options.entrypoint ?? null,
    scope: options.scope ?? null,
  });
  try {
    return await runner();
  } finally {
    const current = activeHighMemoryVolumeGenerations.get(key);
    if (current?.startedAt === now) {
      activeHighMemoryVolumeGenerations.delete(key);
    }
  }
}
