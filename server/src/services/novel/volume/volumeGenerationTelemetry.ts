import { randomUUID } from "node:crypto";
import { AppError } from "../../../middleware/errorHandler";
import { logMemoryUsage } from "../../../runtime/memoryTelemetry";
import {
  acquireScopedHighMemoryReservation,
  startHighMemoryReservationRenewal,
} from "../highMemoryReservation";
import type { VolumeGenerateOptions } from "./volumeModels";
import { resolveHighMemoryVolumeGenerationKey } from "./volumeGenerationMemorySafety";

const HIGH_MEMORY_VOLUME_RESERVATION_TTL_MS = 10 * 60 * 1000;
const HIGH_MEMORY_VOLUME_RESERVATION_RENEW_MS = 2 * 60 * 1000;

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

  const reservation = await acquireScopedHighMemoryReservation({
    namespace: "novel-high-memory",
    novelId,
    scope: key.slice(`${novelId.trim()}:`.length) || "book",
    ownerId: options.taskId?.trim() || `volume:${novelId.trim()}:${process.pid}:${now}:${randomUUID()}`,
    ttlMs: HIGH_MEMORY_VOLUME_RESERVATION_TTL_MS,
    metadata: {
      entrypoint: options.entrypoint ?? null,
      stage: resolveVolumeGenerationTelemetryStage(options),
      itemKey: resolveVolumeGenerationTelemetryItemKey(options),
      volumeId: options.targetVolumeId ?? null,
      chapterId: options.targetChapterId ?? null,
    },
  });
  if (!reservation.acquired) {
    logMemoryUsage({
      event: "duplicate_blocked",
      component: "generateVolumes",
      novelId,
      taskId: options.taskId,
      stage: resolveVolumeGenerationTelemetryStage(options),
      itemKey: resolveVolumeGenerationTelemetryItemKey(options),
      scope: options.scope ?? "strategy",
      entrypoint: options.entrypoint,
      volumeId: options.targetVolumeId,
      chapterId: options.targetChapterId,
    });
    throw new AppError("当前小说已有高内存卷规划生成正在处理同一范围，请稍后再试。", 409);
  }
  const stopRenewingReservation = startHighMemoryReservationRenewal(reservation.handle, {
    ttlMs: HIGH_MEMORY_VOLUME_RESERVATION_TTL_MS,
    intervalMs: HIGH_MEMORY_VOLUME_RESERVATION_RENEW_MS,
  });

  activeHighMemoryVolumeGenerations.set(key, {
    startedAt: now,
    entrypoint: options.entrypoint ?? null,
    scope: options.scope ?? null,
  });
  try {
    return await runner();
  } finally {
    stopRenewingReservation();
    await reservation.handle.release();
    const current = activeHighMemoryVolumeGenerations.get(key);
    if (current?.startedAt === now) {
      activeHighMemoryVolumeGenerations.delete(key);
    }
  }
}
