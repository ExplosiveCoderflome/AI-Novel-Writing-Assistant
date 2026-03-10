import type { StructuredChapter, StructuredVolume } from "./structuredOutline.utils";

export interface OutlineSyncChapter {
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

export interface StructuredSyncOptions {
  preserveContent: boolean;
  applyDeletes: boolean;
}

export interface StructuredSyncPreviewItem {
  action: "create" | "update" | "keep" | "delete" | "delete_candidate";
  order: number;
  nextTitle: string;
  previousTitle?: string;
  hasContent: boolean;
  changedFields: string[];
}

export interface StructuredSyncPreview {
  createCount: number;
  updateCount: number;
  keepCount: number;
  deleteCount: number;
  deleteCandidateCount: number;
  affectedGeneratedCount: number;
  clearContentCount: number;
  items: StructuredSyncPreviewItem[];
}

export interface StructuredSyncPlan {
  preview: StructuredSyncPreview;
  creates: StructuredChapter[];
  updates: Array<{
    chapterId: string;
    chapter: StructuredChapter;
    clearContent: boolean;
  }>;
  deletes: Array<{
    chapterId: string;
    order: number;
    title: string;
    hasContent: boolean;
  }>;
}

function flattenStructuredChapters(volumes: StructuredVolume[]): StructuredChapter[] {
  const chapterMap = new Map<number, StructuredChapter>();
  for (const volume of volumes) {
    for (const chapter of volume.chapters ?? []) {
      if (!chapterMap.has(chapter.order)) {
        chapterMap.set(chapter.order, chapter);
      }
    }
  }
  return Array.from(chapterMap.values()).sort((a, b) => a.order - b.order);
}

function hasGeneratedContent(content: string | null | undefined): boolean {
  return Boolean(content && content.trim().length > 0);
}

function compareNullableString(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim() === (b ?? "").trim();
}

function compareNullableNumber(a: number | null | undefined, b: number | null | undefined): boolean {
  if (typeof a !== "number" && typeof b !== "number") {
    return true;
  }
  return (a ?? null) === (b ?? null);
}

function getChangedFields(existing: OutlineSyncChapter, chapter: StructuredChapter): string[] {
  const changed: string[] = [];
  if (!compareNullableString(existing.title, chapter.title)) {
    changed.push("标题");
  }
  if (!compareNullableString(existing.expectation, chapter.summary)) {
    changed.push("摘要");
  }
  if (!compareNullableNumber(existing.targetWordCount, chapter.targetWordCount)) {
    changed.push("目标字数");
  }
  if (!compareNullableNumber(existing.conflictLevel, chapter.conflictLevel)) {
    changed.push("冲突等级");
  }
  if (!compareNullableNumber(existing.revealLevel, chapter.revealLevel)) {
    changed.push("揭露等级");
  }
  if (!compareNullableString(existing.mustAvoid, chapter.mustAvoid)) {
    changed.push("禁止事项");
  }
  if (chapter.taskSheet?.trim() && !compareNullableString(existing.taskSheet, chapter.taskSheet)) {
    changed.push("任务单");
  }
  return changed;
}

export function buildStructuredOutlineSyncPreview(
  volumes: StructuredVolume[],
  existingChapters: OutlineSyncChapter[],
  options: StructuredSyncOptions,
): StructuredSyncPreview {
  const targetChapters = flattenStructuredChapters(volumes);
  const existingByOrder = new Map(existingChapters.map((chapter) => [chapter.order, chapter]));
  const targetOrderSet = new Set(targetChapters.map((chapter) => chapter.order));
  const items: StructuredSyncPreviewItem[] = [];
  let createCount = 0;
  let updateCount = 0;
  let keepCount = 0;
  let deleteCount = 0;
  let deleteCandidateCount = 0;
  let affectedGeneratedCount = 0;
  let clearContentCount = 0;

  for (const chapter of targetChapters) {
    const existing = existingByOrder.get(chapter.order);
    if (!existing) {
      createCount += 1;
      items.push({
        action: "create",
        order: chapter.order,
        nextTitle: chapter.title,
        hasContent: false,
        changedFields: ["新章节"],
      });
      continue;
    }
    const changedFields = getChangedFields(existing, chapter);
    const hasContent = hasGeneratedContent(existing.content);
    if (changedFields.length === 0) {
      keepCount += 1;
      items.push({
        action: "keep",
        order: chapter.order,
        nextTitle: chapter.title,
        previousTitle: existing.title,
        hasContent,
        changedFields: [],
      });
      continue;
    }
    updateCount += 1;
    if (hasContent) {
      affectedGeneratedCount += 1;
      if (!options.preserveContent) {
        clearContentCount += 1;
      }
    }
    items.push({
      action: "update",
      order: chapter.order,
      nextTitle: chapter.title,
      previousTitle: existing.title,
      hasContent,
      changedFields,
    });
  }

  const removed = existingChapters
    .filter((chapter) => !targetOrderSet.has(chapter.order))
    .sort((a, b) => a.order - b.order);
  for (const chapter of removed) {
    const hasContent = hasGeneratedContent(chapter.content);
    if (options.applyDeletes) {
      deleteCount += 1;
      items.push({
        action: "delete",
        order: chapter.order,
        nextTitle: chapter.title,
        hasContent,
        changedFields: ["从大纲移除"],
      });
    } else {
      deleteCandidateCount += 1;
      items.push({
        action: "delete_candidate",
        order: chapter.order,
        nextTitle: chapter.title,
        hasContent,
        changedFields: ["待确认删除"],
      });
    }
  }

  return {
    createCount,
    updateCount,
    keepCount,
    deleteCount,
    deleteCandidateCount,
    affectedGeneratedCount,
    clearContentCount,
    items,
  };
}

export function buildStructuredOutlineSyncPlan(
  volumes: StructuredVolume[],
  existingChapters: OutlineSyncChapter[],
  options: StructuredSyncOptions,
): StructuredSyncPlan {
  const targetChapters = flattenStructuredChapters(volumes);
  const existingByOrder = new Map(existingChapters.map((chapter) => [chapter.order, chapter]));
  const targetOrderSet = new Set(targetChapters.map((chapter) => chapter.order));
  const preview = buildStructuredOutlineSyncPreview(volumes, existingChapters, options);
  const creates: StructuredChapter[] = [];
  const updates: Array<{
    chapterId: string;
    chapter: StructuredChapter;
    clearContent: boolean;
  }> = [];
  const deletes: Array<{
    chapterId: string;
    order: number;
    title: string;
    hasContent: boolean;
  }> = [];

  for (const chapter of targetChapters) {
    const existing = existingByOrder.get(chapter.order);
    if (!existing) {
      creates.push(chapter);
      continue;
    }
    const changedFields = getChangedFields(existing, chapter);
    if (changedFields.length === 0) {
      continue;
    }
    const hasContent = hasGeneratedContent(existing.content);
    updates.push({
      chapterId: existing.id,
      chapter,
      clearContent: hasContent && !options.preserveContent,
    });
  }

  if (options.applyDeletes) {
    for (const chapter of existingChapters) {
      if (targetOrderSet.has(chapter.order)) {
        continue;
      }
      deletes.push({
        chapterId: chapter.id,
        order: chapter.order,
        title: chapter.title,
        hasContent: hasGeneratedContent(chapter.content),
      });
    }
  }

  return { preview, creates, updates, deletes };
}
