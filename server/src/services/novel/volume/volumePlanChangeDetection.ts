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

export interface ExistingChapterRecord {
  id: string;
  order: number;
  title: string;
  content?: string | null;
  generationState?: Chapter["generationState"] | null;
  chapterStatus?: Chapter["chapterStatus"] | null;
  expectation?: string | null;
  exclusiveEvent?: string | null;
  endingState?: string | null;
  nextChapterEntryState?: string | null;
  targetWordCount?: number | null;
  conflictLevel?: number | null;
  revealLevel?: number | null;
  mustAvoid?: string | null;
  taskSheet?: string | null;
  sceneCards?: string | null;
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

function compareText(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim() === (b ?? "").trim();
}

function compareNumber(a: number | null | undefined, b: number | null | undefined): boolean {
  return (typeof a === "number" ? a : null) === (typeof b === "number" ? b : null);
}

function compareStringArray(a: string[], b: string[]): boolean {
  return a.join("\n") === b.join("\n");
}

function normalizeStringArray(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function flattenVolumeChapters(volumes: VolumePlan[]) {
  return volumes
    .slice()
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
  if (!compareText(existing.exclusiveEvent, chapter.exclusiveEvent)) changed.push("独占事件");
  if (!compareText(existing.endingState, chapter.endingState)) changed.push("章末状态");
  if (!compareText(existing.nextChapterEntryState, chapter.nextChapterEntryState)) changed.push("下章起始状态");
  if (!compareNumber(existing.targetWordCount, chapter.targetWordCount)) changed.push("目标字数");
  if (!compareNumber(existing.conflictLevel, chapter.conflictLevel)) changed.push("冲突等级");
  if (!compareNumber(existing.revealLevel, chapter.revealLevel)) changed.push("揭露等级");
  if (!compareText(existing.mustAvoid, chapter.mustAvoid)) changed.push("禁止事项");
  if (!compareText(existing.taskSheet, chapter.taskSheet)) changed.push("任务单");
  if (!compareText(existing.sceneCards, chapter.sceneCards)) changed.push("场景预算");
  return changed;
}

function buildVolumeOutlineSnapshot(volumes: VolumePlan[]): string {
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

function buildPayoffLedgerSignalSnapshot(volumes: VolumePlan[]) {
  return volumes
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((volume) => {
      const openPayoffs = normalizeStringArray(volume.openPayoffs);
      const payoffRefChapters = volume.chapters
        .slice()
        .sort((a, b) => a.chapterOrder - b.chapterOrder)
        .map((chapter) => ({
          chapterOrder: chapter.chapterOrder,
          payoffRefs: normalizeStringArray(chapter.payoffRefs),
        }))
        .filter((chapter) => chapter.payoffRefs.length > 0);
      const shouldTrackVolumeWindow = openPayoffs.length > 0 || payoffRefChapters.length > 0;
      if (!shouldTrackVolumeWindow) {
        return null;
      }
      return {
        sortOrder: volume.sortOrder,
        openPayoffs,
        chapterOrders: volume.chapters
          .slice()
          .sort((a, b) => a.chapterOrder - b.chapterOrder)
          .map((chapter) => chapter.chapterOrder),
        payoffRefChapters,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export function hasPayoffLedgerSourceSignals(volumes: VolumePlan[]): boolean {
  return buildPayoffLedgerSignalSnapshot(volumes).length > 0;
}

export function hasPayoffLedgerRelevantPlanChanges(beforeVolumes: VolumePlan[], afterVolumes: VolumePlan[]): boolean {
  return JSON.stringify(buildPayoffLedgerSignalSnapshot(beforeVolumes))
    !== JSON.stringify(buildPayoffLedgerSignalSnapshot(afterVolumes));
}

export function buildTaskSheetFromVolumeChapter(chapter: VolumeChapterPlan): string {
  const lines = [
    `章节目标：${chapter.purpose || chapter.summary || "推进主线"}`,
    chapter.exclusiveEvent ? `独占事件：${chapter.exclusiveEvent}` : "",
    chapter.endingState ? `章末状态：${chapter.endingState}` : "",
    chapter.nextChapterEntryState ? `下章起始状态：${chapter.nextChapterEntryState}` : "",
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
      exclusiveEvent: beforeChapter.exclusiveEvent,
      endingState: beforeChapter.endingState,
      nextChapterEntryState: beforeChapter.nextChapterEntryState,
      targetWordCount: beforeChapter.targetWordCount,
      conflictLevel: beforeChapter.conflictLevel,
      revealLevel: beforeChapter.revealLevel,
      mustAvoid: beforeChapter.mustAvoid,
      taskSheet: beforeChapter.taskSheet,
      sceneCards: beforeChapter.sceneCards,
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
            exclusiveEvent: beforeChapter.exclusiveEvent,
            endingState: beforeChapter.endingState,
            nextChapterEntryState: beforeChapter.nextChapterEntryState,
            targetWordCount: beforeChapter.targetWordCount,
            conflictLevel: beforeChapter.conflictLevel,
            revealLevel: beforeChapter.revealLevel,
            mustAvoid: beforeChapter.mustAvoid,
            taskSheet: beforeChapter.taskSheet,
            sceneCards: beforeChapter.sceneCards,
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
    changedLines: estimateChangedLines(buildVolumeOutlineSnapshot(beforeVolumes), buildVolumeOutlineSnapshot(afterVolumes)),
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
