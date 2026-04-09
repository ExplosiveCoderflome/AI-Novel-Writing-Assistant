import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  Chapter,
  VolumeChapterPlan,
  VolumeImpactResult,
  VolumePlan,
  VolumePlanDiff,
  VolumePlanDiffVolume,
  VolumeSyncPreview,
  VolumeSyncPreviewItem,
} from "@ai-novel/shared/types/novel";

type JsonRecord = Record<string, unknown>;

export interface ExistingChapterRecord {
  id: string;
  order: number;
  title: string;
  content?: string | null;
  generationState?: Chapter["generationState"] | null;
  chapterStatus?: Chapter["chapterStatus"] | null;
  expectation?: string | null;
  targetWordCount?: number | null;
  conflictLevel?: number | null;
  revealLevel?: number | null;
  mustAvoid?: string | null;
  taskSheet?: string | null;
}

export interface VolumeSyncPlan {
  preview: VolumeSyncPreview;
  creates: Array<{
    volumeTitle: string;
    chapter: VolumeChapterPlan;
  }>;
  updates: Array<{
    chapterId: string;
    chapter: VolumeChapterPlan;
    clearContent: boolean;
    preserveWorkflowState: boolean;
    existingGenerationState?: Chapter["generationState"] | null;
    existingChapterStatus?: Chapter["chapterStatus"] | null;
  }>;
  deletes: Array<{
    chapterId: string;
    order: number;
    title: string;
    hasContent: boolean;
  }>;
}

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
  chapters?: Array<Pick<Chapter, "order" | "title" | "expectation" | "targetWordCount" | "conflictLevel" | "revealLevel" | "mustAvoid" | "taskSheet">>;
  arcPlans?: LegacyArcSignal[];
}

const volumeChapterInputSchema = z.object({
  id: z.string().trim().min(1).optional(),
  chapterOrder: z.number().int().min(1).optional(),
  order: z.number().int().min(1).optional(),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  purpose: z.string().trim().nullable().optional(),
  conflictLevel: z.number().int().min(0).max(100).nullable().optional(),
  revealLevel: z.number().int().min(0).max(100).nullable().optional(),
  targetWordCount: z.number().int().min(200).max(20000).nullable().optional(),
  mustAvoid: z.string().trim().nullable().optional(),
  taskSheet: z.string().trim().nullable().optional(),
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
          title: z.string().trim().min(1),
          summary: z.string().trim().min(1),
          purpose: z.string().trim().optional().nullable(),
          conflictLevel: z.number().int().min(0).max(100).optional().nullable(),
          revealLevel: z.number().int().min(0).max(100).optional().nullable(),
          targetWordCount: z.number().int().min(200).max(20000).optional().nullable(),
          mustAvoid: z.string().trim().optional().nullable(),
          taskSheet: z.string().trim().optional().nullable(),
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

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  } catch {
    return raw
      .split(/[\n,，;；、]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function normalizeNullableNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function compareText(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim() === (b ?? "").trim();
}

function compareNumber(a: number | null | undefined, b: number | null | undefined): boolean {
  return (typeof a === "number" ? a : null) === (typeof b === "number" ? b : null);
}

function compareStringArray(a: string[], b: string[]): boolean {
  return a.join("\n") === b.join("\n");
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
      .split(/[\n,，;；、]/)
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
    title: chapter.title.trim(),
    summary: chapter.summary.trim(),
    purpose: normalizeText(chapter.purpose),
    conflictLevel: normalizeNullableNumber(chapter.conflictLevel),
    revealLevel: normalizeNullableNumber(chapter.revealLevel),
    targetWordCount: normalizeNullableNumber(chapter.targetWordCount),
    mustAvoid: normalizeText(chapter.mustAvoid),
    taskSheet: normalizeText(chapter.taskSheet),
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
  const purpose = pickFirstString(raw, ["purpose", "goal", "chapterGoal"]);
  const mustAvoid = pickFirstString(raw, ["mustAvoid", "must_avoid", "forbidden"]);
  const taskSheet = pickFirstString(raw, ["taskSheet", "task_sheet"]);
  const chapterId = createLocalId("legacy-chapter");
  if (!title.trim() && !summary.trim()) {
    return null;
  }
  return {
    id: chapterId,
    volumeId: "",
    chapterOrder,
    title,
    summary,
    purpose,
    conflictLevel: parseScore(raw.conflictLevel ?? raw.conflict_level),
    revealLevel: parseScore(raw.revealLevel ?? raw.reveal_level),
    targetWordCount: parsePositiveInteger(raw.targetWordCount ?? raw.target_word_count ?? raw.wordCount),
    mustAvoid,
    taskSheet,
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
      mainPromise: null,
      escalationMode: null,
      protagonistChange: null,
      climax: null,
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
      openingHook: "待补全开卷抓手",
      mainPromise: normalizeText(source.outline) ?? "待补全卷级主承诺。",
      primaryPressureSource: "待补全主压迫源",
      coreSellingPoint: "待补全核心卖点",
      escalationMode: "待补全",
      protagonistChange: "待补全",
      midVolumeRisk: "待补全中段塌陷风险",
      climax: "待补全",
      payoffType: "待补全兑现类型",
      nextVolumeHook: "待补全",
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
      openingHook: chunk[0]?.expectation?.trim() || "待补全开卷抓手",
      mainPromise: chunk[0]?.expectation?.trim() || normalizeText(source.outline) || "待补全卷级主承诺。",
      primaryPressureSource: "待补全主压迫源",
      coreSellingPoint: "待补全核心卖点",
      escalationMode: "逐步升级",
      protagonistChange: "待补全角色变化",
      midVolumeRisk: "待补全中段风险",
      climax: chunk[chunk.length - 1]?.expectation?.trim() || "待补全卷末高潮",
      payoffType: "阶段兑现",
      nextVolumeHook: "待补全下卷钩子",
      resetPoint: null,
      openPayoffs: [],
      status: "active",
      sourceVersionId: null,
      chapters: chunk.map((chapter) => ({
        id: createLocalId("legacy-chapter"),
        volumeId,
        chapterOrder: chapter.order,
        title: chapter.title,
        summary: chapter.expectation?.trim() || "",
        purpose: chapter.expectation?.trim() || null,
        conflictLevel: chapter.conflictLevel ?? null,
        revealLevel: chapter.revealLevel ?? null,
        targetWordCount: chapter.targetWordCount ?? null,
        mustAvoid: chapter.mustAvoid ?? null,
        taskSheet: chapter.taskSheet ?? null,
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
        volume.openPayoffs.length > 0 ? `未兑现事项：${volume.openPayoffs.join("；")}` : "",
        `章节范围：${chapterSpan}`,
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n\n");
}

export function buildDerivedStructuredOutlineFromVolumes(volumes: VolumePlan[]): string {
  return JSON.stringify({
    volumes: volumes
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
            title: chapter.title,
            summary: chapter.summary,
            purpose: chapter.purpose ?? undefined,
            conflict_level: chapter.conflictLevel ?? undefined,
            reveal_level: chapter.revealLevel ?? undefined,
            target_word_count: chapter.targetWordCount ?? undefined,
            must_avoid: chapter.mustAvoid ?? undefined,
            task_sheet: chapter.taskSheet ?? undefined,
            payoff_refs: chapter.payoffRefs,
          })),
      })),
  }, null, 2);
}

function flattenVolumeChapters(volumes: VolumePlan[]) {
  return volumes
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((volume) => volume.chapters
      .slice()
      .sort((a, b) => a.chapterOrder - b.chapterOrder)
      .map((chapter) => ({ volume, chapter })));
}

function hasGeneratedContent(content: string | null | undefined): boolean {
  return Boolean(content?.trim());
}

function normalizeLookupTitle(title: string): string {
  return title.trim().toLowerCase();
}

function getChapterChangedFields(existing: ExistingChapterRecord, chapter: VolumeChapterPlan, action: "update" | "move"): string[] {
  const changed: string[] = action === "move" ? ["章节顺序"] : [];
  if (!compareText(existing.title, chapter.title)) changed.push("标题");
  if (!compareText(existing.expectation, chapter.summary)) changed.push("摘要");
  if (!compareNumber(existing.targetWordCount, chapter.targetWordCount)) changed.push("目标字数");
  if (!compareNumber(existing.conflictLevel, chapter.conflictLevel)) changed.push("冲突等级");
  if (!compareNumber(existing.revealLevel, chapter.revealLevel)) changed.push("揭露等级");
  if (!compareText(existing.mustAvoid, chapter.mustAvoid)) changed.push("禁止事项");
  if (!compareText(existing.taskSheet, chapter.taskSheet)) changed.push("任务单");
  return changed;
}

export function buildTaskSheetFromVolumeChapter(chapter: VolumeChapterPlan): string {
  const lines = [
    `章节目标：${chapter.purpose || chapter.summary || "推进主线"}`,
    typeof chapter.conflictLevel === "number" ? `冲突等级：${chapter.conflictLevel}` : "",
    typeof chapter.revealLevel === "number" ? `揭露等级：${chapter.revealLevel}` : "",
    typeof chapter.targetWordCount === "number" ? `目标字数：${chapter.targetWordCount}` : "",
    chapter.mustAvoid ? `禁止事项：${chapter.mustAvoid}` : "",
    chapter.payoffRefs.length > 0 ? `兑现关联：${chapter.payoffRefs.join("、")}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export function buildVolumeSyncPlan(
  volumes: VolumePlan[],
  existingChapters: ExistingChapterRecord[],
  options: { preserveContent: boolean; applyDeletes: boolean },
): VolumeSyncPlan {
  const flattened = flattenVolumeChapters(volumes);
  const existingByOrder = new Map(existingChapters.map((chapter) => [chapter.order, chapter]));
  const existingByTitle = new Map(existingChapters.map((chapter) => [normalizeLookupTitle(chapter.title), chapter]));
  const matchedChapterIds = new Set<string>();
  const items: VolumeSyncPreviewItem[] = [];
  const creates: VolumeSyncPlan["creates"] = [];
  const updates: VolumeSyncPlan["updates"] = [];
  const deletes: VolumeSyncPlan["deletes"] = [];
  let createCount = 0;
  let updateCount = 0;
  let keepCount = 0;
  let moveCount = 0;
  let deleteCount = 0;
  let deleteCandidateCount = 0;
  let affectedGeneratedCount = 0;
  let clearContentCount = 0;

  for (const entry of flattened) {
    const { volume, chapter } = entry;
    const existingBySameOrder = existingByOrder.get(chapter.chapterOrder);
    const matchedByOrder = existingBySameOrder && !matchedChapterIds.has(existingBySameOrder.id)
      ? existingBySameOrder
      : undefined;
    const matchedByTitle = existingByTitle.get(normalizeLookupTitle(chapter.title));
    const existing = matchedByOrder ?? (
      matchedByTitle && !matchedChapterIds.has(matchedByTitle.id)
        ? matchedByTitle
        : undefined
    );

    if (!existing) {
      createCount += 1;
      creates.push({ volumeTitle: volume.title, chapter });
      items.push({
        action: "create",
        volumeTitle: volume.title,
        chapterOrder: chapter.chapterOrder,
        nextTitle: chapter.title,
        hasContent: false,
        changedFields: ["新章节"],
      });
      continue;
    }

    matchedChapterIds.add(existing.id);
    const action = existing.order === chapter.chapterOrder ? "update" : "move";
    const changedFields = getChapterChangedFields(existing, chapter, action);
    const hasContent = hasGeneratedContent(existing.content);

    if (changedFields.length === 0) {
      keepCount += 1;
      items.push({
        action: "keep",
        volumeTitle: volume.title,
        chapterOrder: chapter.chapterOrder,
        nextTitle: chapter.title,
        previousTitle: existing.title,
        hasContent,
        changedFields: [],
      });
      continue;
    }

    if (action === "move") {
      moveCount += 1;
    } else {
      updateCount += 1;
    }
    if (hasContent) {
      affectedGeneratedCount += 1;
      if (!options.preserveContent) {
        clearContentCount += 1;
      }
    }
    updates.push({
      chapterId: existing.id,
      chapter,
      clearContent: hasContent && !options.preserveContent,
      preserveWorkflowState: hasContent && options.preserveContent,
      existingGenerationState: existing.generationState ?? null,
      existingChapterStatus: existing.chapterStatus ?? null,
    });
    items.push({
      action,
      volumeTitle: volume.title,
      chapterOrder: chapter.chapterOrder,
      nextTitle: chapter.title,
      previousTitle: existing.title,
      hasContent,
      changedFields,
    });
  }

  for (const chapter of existingChapters.slice().sort((a, b) => a.order - b.order)) {
    if (matchedChapterIds.has(chapter.id)) {
      continue;
    }
    const hasContent = hasGeneratedContent(chapter.content);
    if (options.applyDeletes) {
      deleteCount += 1;
      deletes.push({
        chapterId: chapter.id,
        order: chapter.order,
        title: chapter.title,
        hasContent,
      });
      items.push({
        action: "delete",
        volumeTitle: "未匹配",
        chapterOrder: chapter.order,
        nextTitle: chapter.title,
        previousTitle: chapter.title,
        hasContent,
        changedFields: ["从卷纲移除"],
      });
    } else {
      deleteCandidateCount += 1;
      items.push({
        action: "delete_candidate",
        volumeTitle: "未匹配",
        chapterOrder: chapter.order,
        nextTitle: chapter.title,
        previousTitle: chapter.title,
        hasContent,
        changedFields: ["待确认删除"],
      });
    }
  }

  const affectedVolumeCount = new Set(
    items.filter((item) => item.action !== "keep").map((item) => item.volumeTitle),
  ).size;

  return {
    preview: {
      createCount,
      updateCount,
      keepCount,
      moveCount,
      deleteCount,
      deleteCandidateCount,
      affectedGeneratedCount,
      clearContentCount,
      affectedVolumeCount,
      items,
    },
    creates,
    updates,
    deletes,
  };
}

function estimateChangedLines(beforeText: string, afterText: string): number {
  const beforeLines = beforeText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const afterLines = afterText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);
  let changed = 0;
  for (const line of afterLines) {
    if (!beforeSet.has(line)) changed += 1;
  }
  for (const line of beforeLines) {
    if (!afterSet.has(line)) changed += 1;
  }
  return changed;
}

function collectVolumeChangedFields(beforeVolume: VolumePlan | undefined, afterVolume: VolumePlan): string[] {
  if (!beforeVolume) {
    return ["新增卷"];
  }
  const changed: string[] = [];
  if (!compareText(beforeVolume.title, afterVolume.title)) changed.push("卷标题");
  if (!compareText(beforeVolume.summary, afterVolume.summary)) changed.push("卷摘要");
  if (!compareText(beforeVolume.openingHook, afterVolume.openingHook)) changed.push("开卷抓手");
  if (!compareText(beforeVolume.mainPromise, afterVolume.mainPromise)) changed.push("主承诺");
  if (!compareText(beforeVolume.primaryPressureSource, afterVolume.primaryPressureSource)) changed.push("主压迫源");
  if (!compareText(beforeVolume.coreSellingPoint, afterVolume.coreSellingPoint)) changed.push("核心卖点");
  if (!compareText(beforeVolume.escalationMode, afterVolume.escalationMode)) changed.push("升级方式");
  if (!compareText(beforeVolume.protagonistChange, afterVolume.protagonistChange)) changed.push("主角变化");
  if (!compareText(beforeVolume.midVolumeRisk, afterVolume.midVolumeRisk)) changed.push("中段风险");
  if (!compareText(beforeVolume.climax, afterVolume.climax)) changed.push("卷末高潮");
  if (!compareText(beforeVolume.payoffType, afterVolume.payoffType)) changed.push("兑现类型");
  if (!compareText(beforeVolume.nextVolumeHook, afterVolume.nextVolumeHook)) changed.push("下卷钩子");
  if (!compareText(beforeVolume.resetPoint, afterVolume.resetPoint)) changed.push("重置点");
  if (!compareStringArray(beforeVolume.openPayoffs, afterVolume.openPayoffs)) changed.push("未兑现事项");
  if (beforeVolume.chapters.length !== afterVolume.chapters.length) changed.push("章节数量");
  const beforeChapterMap = new Map(beforeVolume.chapters.map((chapter) => [chapter.chapterOrder, chapter]));
  const chapterChanged = afterVolume.chapters.some((chapter) => {
    const beforeChapter = beforeChapterMap.get(chapter.chapterOrder);
    if (!beforeChapter) {
      return true;
    }
    return getChapterChangedFields({
      id: beforeChapter.id,
      order: beforeChapter.chapterOrder,
      title: beforeChapter.title,
      expectation: beforeChapter.summary,
      targetWordCount: beforeChapter.targetWordCount,
      conflictLevel: beforeChapter.conflictLevel,
      revealLevel: beforeChapter.revealLevel,
      mustAvoid: beforeChapter.mustAvoid,
      taskSheet: beforeChapter.taskSheet,
    }, chapter, "update").length > 0;
  });
  if (chapterChanged) changed.push("章节规划");
  return changed;
}

export function buildVolumeDiffSummary(changedVolumes: VolumePlanDiffVolume[]): string {
  if (changedVolumes.length === 0) {
    return "卷级结构无变化。";
  }
  return changedVolumes
    .map((volume) => `第${volume.sortOrder}卷《${volume.title}》：${volume.changedFields.join("、")}${volume.chapterOrders.length > 0 ? `；波及章节 ${volume.chapterOrders.join("、")}` : ""}`)
    .join("\n");
}

export function buildVolumeDiff(
  beforeVolumes: VolumePlan[],
  afterVolumes: VolumePlan[],
  versionMeta: {
    id: string;
    novelId: string;
    version: number;
    status: "draft" | "active" | "frozen";
    diffSummary?: string | null;
  },
): VolumePlanDiff {
  const beforeByOrder = new Map(beforeVolumes.map((volume) => [volume.sortOrder, volume]));
  const changedVolumes: VolumePlanDiffVolume[] = afterVolumes
    .map((volume) => {
      const changedFields = collectVolumeChangedFields(beforeByOrder.get(volume.sortOrder), volume);
      if (changedFields.length === 0) {
        return null;
      }
      const beforeChapterMap = new Map((beforeByOrder.get(volume.sortOrder)?.chapters ?? []).map((chapter) => [chapter.chapterOrder, chapter]));
      const changedChapterOrders = volume.chapters
        .filter((chapter) => {
          const beforeChapter = beforeChapterMap.get(chapter.chapterOrder);
          if (!beforeChapter) {
            return true;
          }
          return getChapterChangedFields({
            id: beforeChapter.id,
            order: beforeChapter.chapterOrder,
            title: beforeChapter.title,
            expectation: beforeChapter.summary,
            targetWordCount: beforeChapter.targetWordCount,
            conflictLevel: beforeChapter.conflictLevel,
            revealLevel: beforeChapter.revealLevel,
            mustAvoid: beforeChapter.mustAvoid,
            taskSheet: beforeChapter.taskSheet,
          }, chapter, "update").length > 0;
        })
        .map((chapter) => chapter.chapterOrder);
      return {
        sortOrder: volume.sortOrder,
        title: volume.title,
        changedFields,
        chapterOrders: changedChapterOrders,
      };
    })
    .filter((item): item is VolumePlanDiffVolume => Boolean(item));

  const affectedChapterOrders = Array.from(new Set(changedVolumes.flatMap((item) => item.chapterOrders))).sort((a, b) => a - b);
  return {
    id: versionMeta.id,
    novelId: versionMeta.novelId,
    version: versionMeta.version,
    status: versionMeta.status,
    diffSummary: versionMeta.diffSummary ?? buildVolumeDiffSummary(changedVolumes),
    changedLines: estimateChangedLines(buildDerivedOutlineFromVolumes(beforeVolumes), buildDerivedOutlineFromVolumes(afterVolumes)),
    changedVolumeCount: changedVolumes.length,
    changedChapterCount: affectedChapterOrders.length,
    changedVolumes,
    affectedChapterOrders,
  };
}

export function buildVolumeImpactResult(
  novelId: string,
  beforeVolumes: VolumePlan[],
  afterVolumes: VolumePlan[],
  sourceVersion: number | null,
): VolumeImpactResult {
  const diff = buildVolumeDiff(beforeVolumes, afterVolumes, {
    id: "impact-preview",
    novelId,
    version: sourceVersion ?? 0,
    status: "draft",
    diffSummary: null,
  });
  const requiresChapterSync = diff.changedChapterCount > 0 || diff.changedVolumeCount > 0;
  const requiresCharacterReview = diff.changedVolumes.some((volume) => (
    volume.changedFields.includes("主承诺")
    || volume.changedFields.includes("主角变化")
    || volume.changedFields.includes("卷末高潮")
  ));
  const recommendedActions = [
    requiresChapterSync ? "同步章节计划" : "",
    requiresCharacterReview ? "复核角色职责与成长线" : "",
    diff.changedLines >= 12 ? "复查关键伏笔与兑现链" : "",
  ].filter(Boolean);

  return {
    novelId,
    sourceVersion,
    changedLines: diff.changedLines,
    affectedVolumeCount: diff.changedVolumeCount,
    affectedChapterCount: diff.changedChapterCount,
    affectedVolumes: diff.changedVolumes,
    requiresChapterSync,
    requiresCharacterReview,
    recommendedActions,
  };
}
