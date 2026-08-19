import i18next from "i18next";
import type {
  VolumeBeatSheet,
  VolumeChapterPlan,
  VolumeCritiqueReport,
  VolumePlan,
  VolumePlanningReadiness,
  VolumeStrategyPlan,
  VolumeSyncPreview,
} from "@ai-novel/shared/types/novel";

export interface ExistingOutlineChapter {
  id: string;
  order: number;
  title: string;
  content?: string | null;
  expectation?: string | null;
  targetWordCount?: number | null;
  conflictLevel?: number | null;
  revealLevel?: number | null;
  mustAvoid?: string | null;
  taskSheet?: string | null;
}

export interface VolumeSyncOptions {
  preserveContent: boolean;
  applyDeletes: boolean;
}

export function buildVolumePlanningReadiness(params: {
  volumes: VolumePlan[];
  strategyPlan: VolumeStrategyPlan | null;
  critiqueReport?: VolumeCritiqueReport | null;
  beatSheets: VolumeBeatSheet[];
}): VolumePlanningReadiness {
  const { volumes, strategyPlan, critiqueReport, beatSheets } = params;
  const blockingReasons: string[] = [];
  if (!strategyPlan) {
    blockingReasons.push(i18next.t("dict.gen_2bc57951"));
  }
  const hasHighRiskCritique = critiqueReport?.overallRisk === "high";
  if (hasHighRiskCritique) {
    blockingReasons.push("当前卷战略审查为高风险，请先重新生成或修订卷战略。");
  }
  if (volumes.length === 0) {
    blockingReasons.push(i18next.t("dict.gen_48867c36"));
  }
  if (!beatSheets.some((sheet) => sheet.beats.length > 0)) {
    blockingReasons.push(i18next.t("dict.gen_e38161cf"));
  }
  return {
    canGenerateStrategy: true,
    canGenerateSkeleton: Boolean(strategyPlan) && !hasHighRiskCritique,
    canGenerateBeatSheet: Boolean(strategyPlan) && volumes.length > 0,
    canGenerateChapterList: Boolean(strategyPlan) && beatSheets.some((sheet) => sheet.beats.length > 0),
    blockingReasons,
  };
}

export function findBeatSheet(beatSheets: VolumeBeatSheet[], volumeId: string): VolumeBeatSheet | null {
  return beatSheets.find((sheet) => sheet.volumeId === volumeId && sheet.beats.length > 0) ?? null;
}

function createLocalId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export function createEmptyVolume(sortOrder: number): VolumePlan {
  return {
    id: createLocalId("volume"),
    novelId: "",
    sortOrder,
    title: i18next.t("novels.outlineCurrentVolumeWorkspace.xrxl0b", { val1: sortOrder }),
    summary: "",
    openingHook: "",
    mainPromise: "",
    primaryPressureSource: "",
    coreSellingPoint: "",
    escalationMode: "",
    protagonistChange: "",
    midVolumeRisk: "",
    climax: "",
    payoffType: "",
    nextVolumeHook: "",
    resetPoint: "",
    openPayoffs: [],
    status: "active",
    sourceVersionId: null,
    chapters: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

export function createEmptyChapter(chapterOrder: number): VolumeChapterPlan {
  return {
    id: createLocalId("chapter"),
    volumeId: "",
    chapterOrder,
    beatKey: null,
    title: i18next.t("tensionCurve.tensionCurveChapterDetailSidebar.xrxssk", { val1: chapterOrder }),
    summary: "",
    purpose: "",
    conflictLevel: null,
    conflictLevelSource: null,
    revealLevel: null,
    targetWordCount: null,
    mustAvoid: "",
    taskSheet: "",
    payoffRefs: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

export function buildTaskSheetFromVolumeChapter(chapter: VolumeChapterPlan): string {
  const targetText = chapter.purpose || chapter.summary || i18next.t("dict.gen_e7168520");
  const lines = [
    i18next.t("novels.volumePlan.purposeTarget", { targetText, defaultValue: i18next.t("novels.structuredOutline.utils.1wl6xd", { val1: (targetText) }) }),
    typeof chapter.conflictLevel === "number" ? i18next.t("novels.structuredOutline.utils.2vuot9", { val1: chapter.conflictLevel }) : "",
    typeof chapter.revealLevel === "number" ? i18next.t("novels.structuredOutline.utils.1y9wmx", { val1: chapter.revealLevel }) : "",
    typeof chapter.targetWordCount === "number" ? i18next.t("novels.volumePlan.utils.qvy0w8", { val1: chapter.targetWordCount }) : "",
    chapter.mustAvoid?.trim() ? i18next.t("novels.structuredOutline.utils.j4v8kb", { val1: chapter.mustAvoid.trim() }) : "",
    chapter.payoffRefs.length > 0 ? i18next.t("novels.volumePlan.utils.zhghbq", { val1: chapter.payoffRefs.join("、") }) : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export function normalizeVolumeDraft(volumes: VolumePlan[]): VolumePlan[] {
  let chapterOrder = 1;
  return volumes
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((volume, volumeIndex) => {
      const volumeId = volume.id || createLocalId("volume");
      const chapters = (volume.chapters ?? [])
        .slice()
        .sort((a, b) => a.chapterOrder - b.chapterOrder)
        .map((chapter) => {
          const normalizedChapter = {
            ...chapter,
            id: chapter.id || createLocalId("chapter"),
            volumeId,
            chapterOrder,
          };
          chapterOrder += 1;
          return normalizedChapter;
        });
      return {
        ...volume,
        id: volumeId,
        sortOrder: volumeIndex + 1,
        openPayoffs: (volume.openPayoffs ?? []).filter((item) => item.trim()),
        openingHook: volume.openingHook ?? "",
        primaryPressureSource: volume.primaryPressureSource ?? "",
        coreSellingPoint: volume.coreSellingPoint ?? "",
        midVolumeRisk: volume.midVolumeRisk ?? "",
        payoffType: volume.payoffType ?? "",
        chapters,
      };
    });
}

export function buildOutlinePreviewFromVolumes(volumes: VolumePlan[]): string {
  return normalizeVolumeDraft(volumes)
    .map((volume) => {
      const chapterSpan = volume.chapters.length > 0
        ? `${volume.chapters[0]?.chapterOrder ?? "-"}-${volume.chapters[volume.chapters.length - 1]?.chapterOrder ?? "-"}`
        : i18next.t("dict.gen_797359eb");
      return [
        i18next.t("novels.volumePlan.utils.brsd3d", { val1: volume.sortOrder, val2: volume.title }),
        volume.summary?.trim() ? i18next.t("novels.volumePlan.utils.w0q0yy", { val1: volume.summary.trim() }) : "",
        volume.openingHook?.trim() ? i18next.t("novels.volumePlan.utils.87n4px", { val1: volume.openingHook.trim() }) : "",
        volume.mainPromise?.trim() ? i18next.t("novels.volumePlan.utils.7xgb3o", { val1: volume.mainPromise.trim() }) : "",
        volume.primaryPressureSource?.trim() ? i18next.t("novels.volumePlan.utils.u0l06t", { val1: volume.primaryPressureSource.trim() }) : "",
        volume.coreSellingPoint?.trim() ? i18next.t("novels.volumePlan.utils.r2hct8", { val1: volume.coreSellingPoint.trim() }) : "",
        volume.escalationMode?.trim() ? i18next.t("novels.volumePlan.utils.bda0mk", { val1: volume.escalationMode.trim() }) : "",
        volume.protagonistChange?.trim() ? i18next.t("novels.volumePlan.utils.f4pnxx", { val1: volume.protagonistChange.trim() }) : "",
        volume.midVolumeRisk?.trim() ? i18next.t("novels.volumePlan.utils.j9xy3d", { val1: volume.midVolumeRisk.trim() }) : "",
        volume.climax?.trim() ? i18next.t("novels.volumePlan.utils.z5pjds", { val1: volume.climax.trim() }) : "",
        volume.payoffType?.trim() ? i18next.t("novels.volumePlan.utils.kilkvv", { val1: volume.payoffType.trim() }) : "",
        volume.nextVolumeHook?.trim() ? i18next.t("novels.volumePlan.utils.o9xgx5", { val1: volume.nextVolumeHook.trim() }) : "",
        volume.resetPoint?.trim() ? i18next.t("novels.volumePlan.utils.h3v92q", { val1: volume.resetPoint.trim() }) : "",
        volume.openPayoffs.length > 0 ? i18next.t("novels.volumePlan.utils.in2r5f", { val1: volume.openPayoffs.join("；") }) : "",
        i18next.t("novels.volumePlan.utils.74lwp5", { val1: chapterSpan }),
      ].filter(Boolean).join("\n");
    })
    .join("\n\n");
}

export function buildStructuredPreviewFromVolumes(volumes: VolumePlan[]): string {
  return JSON.stringify({
    volumes: normalizeVolumeDraft(volumes).map((volume) => ({
      volumeTitle: volume.title,
      summary: volume.summary || undefined,
      openingHook: volume.openingHook || undefined,
      mainPromise: volume.mainPromise || undefined,
      primaryPressureSource: volume.primaryPressureSource || undefined,
      coreSellingPoint: volume.coreSellingPoint || undefined,
      escalationMode: volume.escalationMode || undefined,
      protagonistChange: volume.protagonistChange || undefined,
      midVolumeRisk: volume.midVolumeRisk || undefined,
      climax: volume.climax || undefined,
      payoffType: volume.payoffType || undefined,
      nextVolumeHook: volume.nextVolumeHook || undefined,
      resetPoint: volume.resetPoint || undefined,
      openPayoffs: volume.openPayoffs,
      chapters: volume.chapters.map((chapter) => ({
        chapter_id: chapter.chapterId ?? undefined,
        order: chapter.chapterOrder,
        beat_key: chapter.beatKey ?? undefined,
        title: chapter.title,
        summary: chapter.summary,
        purpose: chapter.purpose || undefined,
        conflict_level: chapter.conflictLevel ?? undefined,
        reveal_level: chapter.revealLevel ?? undefined,
        target_word_count: chapter.targetWordCount ?? undefined,
        must_avoid: chapter.mustAvoid || undefined,
        task_sheet: chapter.taskSheet || undefined,
        payoff_refs: chapter.payoffRefs,
      })),
    })),
  }, null, 2);
}

export function applyVolumeChapterBatch(
  volumes: VolumePlan[],
  patch: {
    conflictLevel?: number;
    targetWordCount?: number;
    generateTaskSheet?: boolean;
  },
): VolumePlan[] {
  return normalizeVolumeDraft(volumes).map((volume) => ({
    ...volume,
    chapters: volume.chapters.map((chapter) => {
      const nextChapter: VolumeChapterPlan = { ...chapter };
      if (typeof patch.conflictLevel === "number") {
        nextChapter.conflictLevel = Math.max(0, Math.min(100, Math.round(patch.conflictLevel)));
      }
      if (typeof patch.targetWordCount === "number") {
        nextChapter.targetWordCount = Math.max(200, Math.round(patch.targetWordCount));
      }
      if (patch.generateTaskSheet) {
        nextChapter.taskSheet = buildTaskSheetFromVolumeChapter(nextChapter);
      }
      return nextChapter;
    }),
  }));
}

function compareText(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim() === (b ?? "").trim();
}

function compareNumber(a: number | null | undefined, b: number | null | undefined): boolean {
  return (typeof a === "number" ? a : null) === (typeof b === "number" ? b : null);
}

function getChangedFields(existing: ExistingOutlineChapter, chapter: VolumeChapterPlan, action: "update" | "move"): string[] {
  const changed: string[] = action === "move" ? [i18next.t("dict.gen_d9a16668")] : [];
  if (!compareText(existing.title, chapter.title)) changed.push(i18next.t("dict.gen_32c65d8d"));
  if (!compareText(existing.expectation, chapter.summary)) changed.push(i18next.t("dict.gen_3ae14696"));
  if (!compareNumber(existing.targetWordCount, chapter.targetWordCount)) changed.push(i18next.t("dict.gen_b71c2e84"));
  if (!compareNumber(existing.conflictLevel, chapter.conflictLevel)) changed.push(i18next.t("dict.gen_971cbaa4"));
  if (!compareNumber(existing.revealLevel, chapter.revealLevel)) changed.push(i18next.t("dict.gen_53fe8284"));
  if (!compareText(existing.mustAvoid, chapter.mustAvoid)) changed.push(i18next.t("dict.gen_e586f3e2"));
  if (!compareText(existing.taskSheet, chapter.taskSheet)) changed.push(i18next.t("dict.singleTask"));
  return changed;
}

export function buildVolumeSyncPreview(
  volumes: VolumePlan[],
  existingChapters: ExistingOutlineChapter[],
  options: VolumeSyncOptions,
): VolumeSyncPreview {
  const normalizedVolumes = normalizeVolumeDraft(volumes);
  const flattened = normalizedVolumes.flatMap((volume) => volume.chapters.map((chapter) => ({ volume, chapter })));
  const existingById = new Map(existingChapters.map((chapter) => [chapter.id, chapter]));
  const existingByOrder = new Map(existingChapters.map((chapter) => [chapter.order, chapter]));
  const existingByTitle = new Map(existingChapters.map((chapter) => [chapter.title.trim().toLowerCase(), chapter]));
  const matchedChapterIds = new Set<string>();
  const items: VolumeSyncPreview["items"] = [];
  let createCount = 0;
  let updateCount = 0;
  let keepCount = 0;
  let moveCount = 0;
  let deleteCount = 0;
  let deleteCandidateCount = 0;
  let affectedGeneratedCount = 0;
  let clearContentCount = 0;

  for (const entry of flattened) {
    const linkedChapterId = entry.chapter.chapterId?.trim();
    const matchedById = linkedChapterId ? existingById.get(linkedChapterId) : undefined;
    const existing = matchedById && !matchedChapterIds.has(matchedById.id)
      ? matchedById
      : (() => {
        if (linkedChapterId) {
          return undefined;
        }
        const existingBySameOrder = existingByOrder.get(entry.chapter.chapterOrder);
        const matchedByOrder = existingBySameOrder && !matchedChapterIds.has(existingBySameOrder.id)
          ? existingBySameOrder
          : undefined;
        const matchedByTitle = existingByTitle.get(entry.chapter.title.trim().toLowerCase());
        return matchedByOrder ?? (
          matchedByTitle && !matchedChapterIds.has(matchedByTitle.id)
            ? matchedByTitle
            : undefined
        );
      })();

    if (!existing) {
      createCount += 1;
      items.push({
        action: "create",
        volumeTitle: entry.volume.title,
        chapterOrder: entry.chapter.chapterOrder,
        nextTitle: entry.chapter.title,
        hasContent: false,
        changedFields: [i18next.t("dict.gen_0aab985d")],
      });
      continue;
    }

    matchedChapterIds.add(existing.id);
    const action = existing.order === entry.chapter.chapterOrder ? "update" : "move";
    const changedFields = getChangedFields(existing, entry.chapter, action);
    const hasContent = Boolean(existing.content?.trim());
    if (changedFields.length === 0) {
      keepCount += 1;
      items.push({
        action: "keep",
        volumeTitle: entry.volume.title,
        chapterOrder: entry.chapter.chapterOrder,
        nextTitle: entry.chapter.title,
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
    items.push({
      action,
      volumeTitle: entry.volume.title,
      chapterOrder: entry.chapter.chapterOrder,
      nextTitle: entry.chapter.title,
      previousTitle: existing.title,
      hasContent,
      changedFields,
    });
  }

  for (const chapter of existingChapters.slice().sort((a, b) => a.order - b.order)) {
    if (matchedChapterIds.has(chapter.id)) {
      continue;
    }
    const hasContent = Boolean(chapter.content?.trim());
    if (options.applyDeletes) {
      deleteCount += 1;
      items.push({
        action: "delete",
        volumeTitle: i18next.t("dict.gen_61b81992"),
        chapterOrder: chapter.order,
        nextTitle: chapter.title,
        previousTitle: chapter.title,
        hasContent,
        changedFields: [i18next.t("dict.removeFromVolumeOutline")],
      });
    } else {
      deleteCandidateCount += 1;
      items.push({
        action: "delete_candidate",
        volumeTitle: i18next.t("dict.gen_61b81992"),
        chapterOrder: chapter.order,
        nextTitle: chapter.title,
        previousTitle: chapter.title,
        hasContent,
        changedFields: [i18next.t("dict.gen_f85caee0")],
      });
    }
  }

  return {
    createCount,
    updateCount,
    keepCount,
    moveCount,
    deleteCount,
    deleteCandidateCount,
    affectedGeneratedCount,
    clearContentCount,
    affectedVolumeCount: new Set(items.filter((item) => item.action !== "keep").map((item) => item.volumeTitle)).size,
    items,
  };
}
