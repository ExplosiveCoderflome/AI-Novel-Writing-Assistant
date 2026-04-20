import { randomUUID } from "node:crypto";
import type {
  VolumeChapterPlan,
  VolumePlan,
} from "@ai-novel/shared/types/novel";

type LooseRecord = Record<string, unknown>;

function createLocalId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function isRecord(value: unknown): value is LooseRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeNullableNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value);
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[\n,，;；、]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeChapterInput(raw: unknown, fallbackOrder: number): Omit<VolumeChapterPlan, "chapterOrder" | "volumeId"> & { inputOrder: number } {
  const record = isRecord(raw) ? raw : {};
  const inputOrder = typeof record.chapterOrder === "number" && Number.isFinite(record.chapterOrder)
    ? Math.max(1, Math.round(record.chapterOrder))
    : typeof record.order === "number" && Number.isFinite(record.order)
      ? Math.max(1, Math.round(record.order))
      : fallbackOrder;

  return {
    id: normalizeText(record.id) ?? createLocalId("generation-chapter"),
    inputOrder,
    beatKey: normalizeText(record.beatKey),
    title: normalizeText(record.title) ?? `第${inputOrder}章`,
    summary: normalizeText(record.summary) ?? normalizeText(record.purpose) ?? "待生成章节摘要",
    purpose: normalizeText(record.purpose),
    exclusiveEvent: normalizeText(record.exclusiveEvent),
    endingState: normalizeText(record.endingState),
    nextChapterEntryState: normalizeText(record.nextChapterEntryState),
    conflictLevel: normalizeNullableNumber(record.conflictLevel),
    revealLevel: normalizeNullableNumber(record.revealLevel),
    targetWordCount: normalizeNullableNumber(record.targetWordCount),
    mustAvoid: normalizeText(record.mustAvoid),
    taskSheet: normalizeText(record.taskSheet),
    sceneCards: normalizeText(record.sceneCards),
    payoffRefs: normalizeStringArray(record.payoffRefs),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

export function normalizeVolumeDraftContextInput(novelId: string, rawVolumes: unknown): VolumePlan[] {
  if (!Array.isArray(rawVolumes)) {
    return [];
  }

  let chapterOrder = 1;

  return rawVolumes
    .map((rawVolume, volumeIndex) => {
      const record = isRecord(rawVolume) ? rawVolume : {};
      const sortOrder = typeof record.sortOrder === "number" && Number.isFinite(record.sortOrder)
        ? Math.max(1, Math.round(record.sortOrder))
        : volumeIndex + 1;
      const volumeId = normalizeText(record.id) ?? createLocalId(`${novelId}-generation-volume`);
      const rawChapters = Array.isArray(record.chapters) ? record.chapters : [];
      const normalizedChapters = rawChapters.length > 0
        ? rawChapters
          .map((chapter, chapterIndex) => normalizeChapterInput(chapter, chapterIndex + 1))
          .sort((left, right) => left.inputOrder - right.inputOrder)
          .map((chapter) => {
            const nextChapter: VolumeChapterPlan = {
              ...chapter,
              volumeId,
              chapterOrder,
            };
            chapterOrder += 1;
            return nextChapter;
          })
        : [];

      return {
        id: volumeId,
        novelId,
        sortOrder,
        title: normalizeText(record.title) ?? `第${sortOrder}卷`,
        summary: normalizeText(record.summary),
        openingHook: normalizeText(record.openingHook),
        mainPromise: normalizeText(record.mainPromise),
        primaryPressureSource: normalizeText(record.primaryPressureSource),
        coreSellingPoint: normalizeText(record.coreSellingPoint),
        escalationMode: normalizeText(record.escalationMode),
        protagonistChange: normalizeText(record.protagonistChange),
        midVolumeRisk: normalizeText(record.midVolumeRisk),
        climax: normalizeText(record.climax),
        payoffType: normalizeText(record.payoffType),
        nextVolumeHook: normalizeText(record.nextVolumeHook),
        resetPoint: normalizeText(record.resetPoint),
        openPayoffs: normalizeStringArray(record.openPayoffs),
        status: normalizeText(record.status) ?? "active",
        sourceVersionId: normalizeText(record.sourceVersionId),
        chapters: normalizedChapters,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      } satisfies VolumePlan;
    })
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((volume, index) => ({
      ...volume,
      sortOrder: index + 1,
    }));
}
