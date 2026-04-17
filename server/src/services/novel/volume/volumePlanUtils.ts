import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  Chapter,
  VolumeChapterPlan,
  VolumePlan,
} from "@ai-novel/shared/types/novel";
export {
  hasPayoffLedgerRelevantPlanChanges,
  hasPayoffLedgerSourceSignals,
  buildTaskSheetFromVolumeChapter,
  buildVolumeDiff,
  buildVolumeDiffSummary,
  buildVolumeImpactResult,
  buildVolumeSyncPlan,
} from "./volumePlanChangeDetection";
export type {
  ExistingChapterRecord,
  VolumeSyncPlan,
} from "./volumePlanChangeDetection";

type JsonRecord = Record<string, unknown>;

export interface LegacyArcSignal {
  externalRef?: string | null;
  title: string;
  objective: string;
  phaseLabel?: string | null;
  hookTarget?: string | null;
  rawPlanJson?: string | null;
}

export interface LegacyVolumeSource {
  outline?: string | null;
  structuredOutline?: string | null;
  estimatedChapterCount?: number | null;
  chapters?: Array<Pick<Chapter, "order" | "title" | "expectation" | "targetWordCount" | "conflictLevel" | "revealLevel" | "mustAvoid" | "taskSheet" | "sceneCards">>;
  arcPlans?: LegacyArcSignal[];
}

const volumeChapterInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  chapterOrder: z.number().int().min(1).optional(),
  order: z.number().int().min(1).optional(),
  beatKey: z.string().trim().nullable().optional(),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  purpose: z.string().trim().nullable().optional(),
  exclusiveEvent: z.string().trim().nullable().optional(),
  endingState: z.string().trim().nullable().optional(),
  nextChapterEntryState: z.string().trim().nullable().optional(),
  conflictLevel: z.number().int().min(0).max(100).nullable().optional(),
  revealLevel: z.number().int().min(0).max(100).nullable().optional(),
  targetWordCount: z.number().int().min(200).max(20000).nullable().optional(),
  mustAvoid: z.string().trim().nullable().optional(),
  taskSheet: z.string().trim().nullable().optional(),
  sceneCards: z.string().trim().nullable().optional(),
  payoffRefs: z.array(z.string().trim().min(1)).optional(),
}).passthrough();

const volumeInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().min(1).optional(),
  title: z.string().trim().min(1),
  summary: z.string().trim().nullable().optional(),
  openingHook: z.string().trim().nullable().optional(),
  mainPromise: z.string().trim().nullable().optional(),
  primaryPressureSource: z.string().trim().nullable().optional(),
  coreSellingPoint: z.string().trim().nullable().optional(),
  escalationMode: z.string().trim().nullable().optional(),
  protagonistChange: z.string().trim().nullable().optional(),
  midVolumeRisk: z.string().trim().nullable().optional(),
  climax: z.string().trim().nullable().optional(),
  payoffType: z.string().trim().nullable().optional(),
  nextVolumeHook: z.string().trim().nullable().optional(),
  resetPoint: z.string().trim().nullable().optional(),
  openPayoffs: z.array(z.string().trim().min(1)).optional(),
  status: z.string().trim().optional(),
  sourceVersionId: z.string().trim().nullable().optional(),
  chapters: z.array(volumeChapterInputSchema).default([]),
}).passthrough();

export const volumeDocumentInputSchema = z.object({
  volumes: z.array(volumeInputSchema).min(1),
});

export const volumeGenerationSchema = z.object({
  volumes: z.array(
    z.object({
      title: z.string().trim().min(1),
      summary: z.string().trim().optional().nullable(),
      mainPromise: z.string().trim().min(1),
      escalationMode: z.string().trim().min(1),
      protagonistChange: z.string().trim().min(1),
      climax: z.string().trim().min(1),
      nextVolumeHook: z.string().trim().min(1),
      resetPoint: z.string().trim().optional().nullable(),
      openPayoffs: z.array(z.string().trim().min(1)).default([]),
      chapters: z.array(
        z.object({
          chapterOrder: z.number().int().min(1),
          beatKey: z.string().trim().nullable().optional(),
          title: z.string().trim().min(1),
          summary: z.string().trim().min(1),
          purpose: z.string().trim().optional().nullable(),
          exclusiveEvent: z.string().trim().optional().nullable(),
          endingState: z.string().trim().optional().nullable(),
          nextChapterEntryState: z.string().trim().optional().nullable(),
          conflictLevel: z.number().int().min(0).max(100).optional().nullable(),
          revealLevel: z.number().int().min(0).max(100).optional().nullable(),
          targetWordCount: z.number().int().min(200).max(20000).optional().nullable(),
          mustAvoid: z.string().trim().optional().nullable(),
          taskSheet: z.string().trim().optional().nullable(),
          sceneCards: z.string().trim().optional().nullable(),
          payoffRefs: z.array(z.string().trim().min(1)).default([]),
        }),
      ).min(1),
    }),
  ).min(1).max(12),
});

function createLocalId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonRecord(raw: string | null | undefined): JsonRecord | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isJsonRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function normalizeNullableNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function pickFirstString(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const match = value.match(/-?\d+/);
    if (!match) {
      return null;
    }
    const parsed = Number.parseInt(match[0], 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parsePositiveInteger(value: unknown): number | null {
  const parsed = parseInteger(value);
  return typeof parsed === "number" && parsed > 0 ? parsed : null;
}

function parseScore(value: unknown): number | null {
  const parsed = parseInteger(value);
  return typeof parsed === "number" && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function parseLooseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[\n,，；、]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function sanitizeVolumeChapter(
  novelId: string,
  volumeId: string,
  chapter: z.infer<typeof volumeChapterInputSchema>,
  index: number,
): VolumeChapterPlan {
  return {
    id: chapter.id?.trim() || createLocalId(`${novelId}-chapter`),
    volumeId,
    chapterOrder: chapter.chapterOrder ?? chapter.order ?? index + 1,
    beatKey: normalizeText(chapter.beatKey),
    title: chapter.title.trim(),
    summary: chapter.summary.trim(),
    purpose: normalizeText(chapter.purpose),
    exclusiveEvent: normalizeText(chapter.exclusiveEvent),
    endingState: normalizeText(chapter.endingState),
    nextChapterEntryState: normalizeText(chapter.nextChapterEntryState),
    conflictLevel: normalizeNullableNumber(chapter.conflictLevel),
    revealLevel: normalizeNullableNumber(chapter.revealLevel),
    targetWordCount: normalizeNullableNumber(chapter.targetWordCount),
    mustAvoid: normalizeText(chapter.mustAvoid),
    taskSheet: normalizeText(chapter.taskSheet),
    sceneCards: normalizeText(chapter.sceneCards),
    payoffRefs: (chapter.payoffRefs ?? []).map((item) => item.trim()).filter(Boolean),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

export function normalizeVolumeDraftInput(novelId: string, rawVolumes: unknown): VolumePlan[] {
  const parsed = volumeDocumentInputSchema.parse({ volumes: rawVolumes }).volumes;
  const usedChapterOrders = new Set<number>();
  return parsed
    .map((volume, index) => {
      const volumeId = volume.id?.trim() || createLocalId(`${novelId}-volume`);
      const chapters = volume.chapters
        .map((chapter, chapterIndex) => sanitizeVolumeChapter(novelId, volumeId, chapter, chapterIndex))
        .sort((a, b) => a.chapterOrder - b.chapterOrder)
        .map((chapter) => {
          let nextOrder = chapter.chapterOrder;
          while (usedChapterOrders.has(nextOrder)) {
            nextOrder += 1;
          }
          usedChapterOrders.add(nextOrder);
          return {
            ...chapter,
            chapterOrder: nextOrder,
          };
        });
      return {
        id: volumeId,
        novelId,
        sortOrder: volume.sortOrder ?? index + 1,
        title: volume.title.trim(),
        summary: normalizeText(volume.summary),
        openingHook: normalizeText(volume.openingHook),
        mainPromise: normalizeText(volume.mainPromise),
        primaryPressureSource: normalizeText(volume.primaryPressureSource),
        coreSellingPoint: normalizeText(volume.coreSellingPoint),
        escalationMode: normalizeText(volume.escalationMode),
        protagonistChange: normalizeText(volume.protagonistChange),
        midVolumeRisk: normalizeText(volume.midVolumeRisk),
        climax: normalizeText(volume.climax),
        payoffType: normalizeText(volume.payoffType),
        nextVolumeHook: normalizeText(volume.nextVolumeHook),
        resetPoint: normalizeText(volume.resetPoint),
        openPayoffs: (volume.openPayoffs ?? []).map((item) => item.trim()).filter(Boolean),
        status: volume.status?.trim() || "active",
        sourceVersionId: normalizeText(volume.sourceVersionId),
        chapters,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      } satisfies VolumePlan;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((volume, index) => ({ ...volume, sortOrder: index + 1 }));
}

function normalizeLegacyChapter(raw: unknown, index: number): VolumeChapterPlan | null {
  if (!isJsonRecord(raw)) {
    return null;
  }
  const chapterOrder = parsePositiveInteger(raw.chapterOrder ?? raw.order ?? raw.chapter ?? raw.chapterNo ?? raw.index) ?? index + 1;
  const title = pickFirstString(raw, ["title", "chapterTitle", "name", "chapterName"]) ?? `第${chapterOrder}章`;
  const summary = pickFirstString(raw, ["summary", "outline", "description", "content"]) ?? "";
  const beatKey = pickFirstString(raw, ["beatKey", "beat_key"]);
  const purpose = pickFirstString(raw, ["purpose", "goal", "chapterGoal"]);
  const exclusiveEvent = pickFirstString(raw, ["exclusiveEvent", "exclusive_event", "chapterExclusiveEvent", "独占事件"]);
  const endingState = pickFirstString(raw, ["endingState", "ending_state", "chapterEndingState", "章末状态"]);
  const nextChapterEntryState = pickFirstString(raw, ["nextChapterEntryState", "next_chapter_entry_state", "nextEntryState", "下章起始状态"]);
  const mustAvoid = pickFirstString(raw, ["mustAvoid", "must_avoid", "forbidden"]);
  const taskSheet = pickFirstString(raw, ["taskSheet", "task_sheet"]);
  const sceneCards = pickFirstString(raw, ["sceneCards", "scene_cards"]);
  if (!title.trim() && !summary.trim()) {
    return null;
  }
  return {
    id: createLocalId("legacy-chapter"),
    volumeId: "",
    chapterOrder,
    beatKey,
    title,
    summary,
    purpose,
    exclusiveEvent,
    endingState,
    nextChapterEntryState,
    conflictLevel: parseScore(raw.conflictLevel ?? raw.conflict_level),
    revealLevel: parseScore(raw.revealLevel ?? raw.reveal_level),
    targetWordCount: parsePositiveInteger(raw.targetWordCount ?? raw.target_word_count ?? raw.wordCount),
    mustAvoid,
    taskSheet,
    sceneCards,
    payoffRefs: parseLooseStringArray(raw.payoffRefs ?? raw.payoff_refs),
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function normalizeLegacyVolume(raw: unknown, index: number): VolumePlan | null {
  if (!isJsonRecord(raw)) {
    return null;
  }
  const volumeId = createLocalId("legacy-volume");
  const rawChapters =
    (Array.isArray(raw.chapters) && raw.chapters)
    || (Array.isArray(raw.chapterList) && raw.chapterList)
    || (Array.isArray(raw.items) && raw.items)
    || (Array.isArray(raw.sections) && raw.sections)
    || [];
  const chapters = rawChapters
    .map((item, chapterIndex) => normalizeLegacyChapter(item, chapterIndex))
    .filter((item): item is VolumeChapterPlan => Boolean(item))
    .sort((a, b) => a.chapterOrder - b.chapterOrder)
    .map((chapter) => ({ ...chapter, volumeId }));
  if (chapters.length === 0) {
    return null;
  }
  return {
    id: volumeId,
    novelId: "",
    sortOrder: index + 1,
    title: pickFirstString(raw, ["volumeTitle", "title", "name", "volume", "arcTitle"]) ?? `第${index + 1}卷`,
    summary: pickFirstString(raw, ["summary", "outline", "description"]),
    openingHook: pickFirstString(raw, ["openingHook", "opening_hook", "startHook"]),
    mainPromise: pickFirstString(raw, ["mainPromise", "promise", "objective"]),
    primaryPressureSource: pickFirstString(raw, ["primaryPressureSource", "pressureSource", "pressure"]),
    coreSellingPoint: pickFirstString(raw, ["coreSellingPoint", "sellingPoint", "selling_point"]),
    escalationMode: pickFirstString(raw, ["escalationMode", "escalation", "phaseLabel"]),
    protagonistChange: pickFirstString(raw, ["protagonistChange", "growth", "arc"]),
    midVolumeRisk: pickFirstString(raw, ["midVolumeRisk", "midRisk", "middleRisk"]),
    climax: pickFirstString(raw, ["climax", "ending", "finale"]),
    payoffType: pickFirstString(raw, ["payoffType", "payoff_type"]),
    nextVolumeHook: pickFirstString(raw, ["nextVolumeHook", "hookTarget", "hook"]),
    resetPoint: pickFirstString(raw, ["resetPoint", "reset"]),
    openPayoffs: parseLooseStringArray(raw.openPayoffs ?? raw.open_payoffs ?? raw.payoffLedger),
    status: "active",
    sourceVersionId: null,
    chapters,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

export function parseLegacyStructuredOutline(raw: string | null | undefined): VolumePlan[] {
  if (!raw?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    const volumeLikeList = Array.isArray(parsed)
      ? parsed
      : isJsonRecord(parsed) && Array.isArray(parsed.volumes)
        ? parsed.volumes
        : isJsonRecord(parsed) && Array.isArray(parsed.items)
          ? parsed.items
          : [];
    if (volumeLikeList.length === 0) {
      return [];
    }

    const normalizedVolumes = volumeLikeList
      .map((volume, volumeIndex) => normalizeLegacyVolume(volume, volumeIndex))
      .filter((volume): volume is VolumePlan => Boolean(volume));
    if (normalizedVolumes.length > 0) {
      return normalizedVolumes;
    }

    const chapters = volumeLikeList
      .map((chapter, chapterIndex) => normalizeLegacyChapter(chapter, chapterIndex))
      .filter((chapter): chapter is VolumeChapterPlan => Boolean(chapter))
      .sort((a, b) => a.chapterOrder - b.chapterOrder);
    if (chapters.length === 0) {
      return [];
    }

    const volumeId = createLocalId("legacy-volume");
    return [{
      id: volumeId,
      novelId: "",
      sortOrder: 1,
      title: "第1卷",
      summary: chapters.map((chapter) => `${chapter.chapterOrder}. ${chapter.title}`).join(" / "),
      openingHook: null,
      mainPromise: null,
      primaryPressureSource: null,
      coreSellingPoint: null,
      escalationMode: null,
      protagonistChange: null,
      midVolumeRisk: null,
      climax: null,
      payoffType: null,
      nextVolumeHook: null,
      resetPoint: null,
      openPayoffs: [],
      status: "active",
      sourceVersionId: null,
      chapters: chapters.map((chapter) => ({ ...chapter, volumeId })),
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }];
  } catch {
    return [];
  }
}

function buildFallbackVolumeSkeleton(source: LegacyVolumeSource): VolumePlan[] {
  const chapterRows = (source.chapters ?? [])
    .slice()
    .sort((a, b) => a.order - b.order);

  if (chapterRows.length === 0) {
    return [{
      id: createLocalId("legacy-volume"),
      novelId: "",
      sortOrder: 1,
      title: "第1卷",
      summary: normalizeText(source.outline) ?? "待补全卷级结构。",
      openingHook: "待补全开卷抓手。",
      mainPromise: normalizeText(source.outline) ?? "待补全卷级主承诺。",
      primaryPressureSource: "待补全主压迫源。",
      coreSellingPoint: "待补全核心卖点。",
      escalationMode: "待补全升级方式。",
      protagonistChange: "待补全主角变化。",
      midVolumeRisk: "待补全中段风险。",
      climax: "待补全卷末高潮。",
      payoffType: "待补全兑现类型。",
      nextVolumeHook: "待补全下卷钩子。",
      resetPoint: null,
      openPayoffs: [],
      status: "active",
      sourceVersionId: null,
      chapters: [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }];
  }

  const chunkSize = chapterRows.length > 24 ? 20 : chapterRows.length;
  const volumes: VolumePlan[] = [];
  for (let start = 0; start < chapterRows.length; start += chunkSize) {
    const chunk = chapterRows.slice(start, start + chunkSize);
    const volumeId = createLocalId("legacy-volume");
    volumes.push({
      id: volumeId,
      novelId: "",
      sortOrder: volumes.length + 1,
      title: `第${volumes.length + 1}卷`,
      summary: chunk.map((item) => `${item.order}. ${item.title}`).join(" / "),
      openingHook: chunk[0]?.expectation?.trim() || "待补全开卷抓手。",
      mainPromise: chunk[0]?.expectation?.trim() || normalizeText(source.outline) || "待补全卷级主承诺。",
      primaryPressureSource: "待补全主压迫源。",
      coreSellingPoint: "待补全核心卖点。",
      escalationMode: "逐步升级",
      protagonistChange: "待补全角色变化。",
      midVolumeRisk: "待补全中段风险。",
      climax: chunk[chunk.length - 1]?.expectation?.trim() || "待补全卷末高潮。",
      payoffType: "阶段兑现",
      nextVolumeHook: "待补全下卷钩子。",
      resetPoint: null,
      openPayoffs: [],
      status: "active",
      sourceVersionId: null,
      chapters: chunk.map((chapter) => ({
        id: createLocalId("legacy-chapter"),
        volumeId,
        chapterOrder: chapter.order,
        beatKey: null,
        title: chapter.title,
        summary: chapter.expectation?.trim() || "",
        purpose: chapter.expectation?.trim() || null,
        exclusiveEvent: null,
        endingState: null,
        nextChapterEntryState: null,
        conflictLevel: chapter.conflictLevel ?? null,
        revealLevel: chapter.revealLevel ?? null,
        targetWordCount: chapter.targetWordCount ?? null,
        mustAvoid: chapter.mustAvoid ?? null,
        taskSheet: chapter.taskSheet ?? null,
        sceneCards: chapter.sceneCards ?? null,
        payoffRefs: [],
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      })),
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });
  }
  return volumes;
}

export function mergeArcSignals(volumes: VolumePlan[], arcPlans: LegacyArcSignal[]): VolumePlan[] {
  const sortedArcPlans = arcPlans.slice().sort((a, b) => {
    const left = parsePositiveInteger(a.externalRef) ?? 0;
    const right = parsePositiveInteger(b.externalRef) ?? 0;
    return left - right;
  });
  return volumes.map((volume, index) => {
    const arc = sortedArcPlans[index];
    if (!arc) {
      return volume;
    }
    const rawPlan = parseJsonRecord(arc.rawPlanJson);
    return {
      ...volume,
      title: volume.title || arc.title || `第${index + 1}卷`,
      mainPromise: volume.mainPromise || normalizeText(arc.objective) || pickFirstString(rawPlan ?? {}, ["mainPromise", "objective"]),
      escalationMode: volume.escalationMode || normalizeText(arc.phaseLabel) || pickFirstString(rawPlan ?? {}, ["escalationMode", "phaseLabel"]),
      climax: volume.climax || pickFirstString(rawPlan ?? {}, ["climax", "ending"]),
      nextVolumeHook: volume.nextVolumeHook || normalizeText(arc.hookTarget) || pickFirstString(rawPlan ?? {}, ["nextVolumeHook", "hookTarget"]),
      openPayoffs: volume.openPayoffs.length > 0 ? volume.openPayoffs : parseLooseStringArray(rawPlan?.payoffLedger ?? rawPlan?.openPayoffs),
    };
  });
}

export function buildFallbackVolumesFromLegacy(novelId: string, source: LegacyVolumeSource): VolumePlan[] {
  const parsedStructured = parseLegacyStructuredOutline(source.structuredOutline);
  let volumes = parsedStructured.length > 0
    ? parsedStructured
    : buildFallbackVolumeSkeleton(source);
  volumes = volumes.map((volume, index) => ({ ...volume, novelId, sortOrder: index + 1 }));

  if (source.arcPlans?.length) {
    volumes = mergeArcSignals(volumes, source.arcPlans);
  }

  return normalizeVolumeDraftInput(novelId, volumes);
}

export function buildDerivedOutlineFromVolumes(volumes: VolumePlan[]): string {
  if (volumes.length === 0) {
    return "";
  }
  return volumes
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((volume) => {
      const chapterSpan = volume.chapters.length > 0
        ? `${volume.chapters[0]?.chapterOrder ?? "-"}-${volume.chapters[volume.chapters.length - 1]?.chapterOrder ?? "-"}`
        : "未拆章";
      const lines = [
        `【第${volume.sortOrder}卷】${volume.title}`,
        volume.summary ? `卷摘要：${volume.summary}` : "",
        volume.openingHook ? `开卷抓手：${volume.openingHook}` : "",
        volume.mainPromise ? `主承诺：${volume.mainPromise}` : "",
        volume.primaryPressureSource ? `主压迫源：${volume.primaryPressureSource}` : "",
        volume.coreSellingPoint ? `核心卖点：${volume.coreSellingPoint}` : "",
        volume.escalationMode ? `升级方式：${volume.escalationMode}` : "",
        volume.protagonistChange ? `主角变化：${volume.protagonistChange}` : "",
        volume.midVolumeRisk ? `中段风险：${volume.midVolumeRisk}` : "",
        volume.climax ? `卷末高潮：${volume.climax}` : "",
        volume.payoffType ? `兑现类型：${volume.payoffType}` : "",
        volume.nextVolumeHook ? `下卷钩子：${volume.nextVolumeHook}` : "",
        volume.resetPoint ? `重置点：${volume.resetPoint}` : "",
        volume.openPayoffs.length > 0 ? `未兑现事项：${volume.openPayoffs.join("、")}` : "",
        `章节范围：${chapterSpan}`,
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n\n");
}

export function buildDerivedStructuredOutlineFromVolumes(volumes: VolumePlan[]): string {
  return JSON.stringify({
    volumes: volumes
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((volume) => ({
        volumeTitle: volume.title,
        summary: volume.summary ?? undefined,
        openingHook: volume.openingHook ?? undefined,
        mainPromise: volume.mainPromise ?? undefined,
        primaryPressureSource: volume.primaryPressureSource ?? undefined,
        coreSellingPoint: volume.coreSellingPoint ?? undefined,
        escalationMode: volume.escalationMode ?? undefined,
        protagonistChange: volume.protagonistChange ?? undefined,
        midVolumeRisk: volume.midVolumeRisk ?? undefined,
        climax: volume.climax ?? undefined,
        payoffType: volume.payoffType ?? undefined,
        nextVolumeHook: volume.nextVolumeHook ?? undefined,
        resetPoint: volume.resetPoint ?? undefined,
        openPayoffs: volume.openPayoffs,
        chapters: volume.chapters
          .slice()
          .sort((a, b) => a.chapterOrder - b.chapterOrder)
          .map((chapter) => ({
            order: chapter.chapterOrder,
            beat_key: chapter.beatKey ?? undefined,
            title: chapter.title,
            summary: chapter.summary,
            purpose: chapter.purpose ?? undefined,
            exclusive_event: chapter.exclusiveEvent ?? undefined,
            ending_state: chapter.endingState ?? undefined,
            next_chapter_entry_state: chapter.nextChapterEntryState ?? undefined,
            conflict_level: chapter.conflictLevel ?? undefined,
            reveal_level: chapter.revealLevel ?? undefined,
            target_word_count: chapter.targetWordCount ?? undefined,
            must_avoid: chapter.mustAvoid ?? undefined,
            task_sheet: chapter.taskSheet ?? undefined,
            scene_cards: chapter.sceneCards ?? undefined,
            payoff_refs: chapter.payoffRefs,
          })),
      })),
  }, null, 2);
}
