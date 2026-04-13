export interface StructuredChapter {
  order: number;
  title: string;
  summary: string;
  purpose?: string;
  keyEvents?: string[];
  involvedRoles?: string[];
  conflictLevel?: number;
  revealLevel?: number;
  pacing?: string;
  foreshadow?: string;
  mustAvoid?: string;
  targetWordCount?: number;
  taskSheet?: string;
}

export interface StructuredVolume {
  volumeTitle: string;
  chapters: StructuredChapter[];
}

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickFirstString(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (trimmed.length > 0) {
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
    const matched = value.match(/-?\d+/);
    if (!matched) {
      return null;
    }
    const parsed = Number.parseInt(matched[0], 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function parsePositiveInteger(value: unknown): number | null {
  const parsed = parseInteger(value);
  if (typeof parsed !== "number" || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseScore(value: unknown): number | undefined {
  const parsed = parseInteger(value);
  if (typeof parsed !== "number") {
    return undefined;
  }
  if (parsed < 0 || parsed > 100) {
    return undefined;
  }
  return parsed;
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter((item) => item.length > 0);
  }
  if (typeof value === "string") {
    return value
      .split(/[\n,，;；、]/g)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return [];
}

function normalizeChapterOrder(raw: unknown, index: number): number {
  const order = parsePositiveInteger(raw);
  return order ?? index + 1;
}

function normalizeStructuredChapter(raw: unknown, index: number): StructuredChapter | null {
  if (!isJsonRecord(raw)) {
    return null;
  }
  const order = normalizeChapterOrder(raw.order ?? raw.chapterOrder ?? raw.chapterNo ?? raw.chapter ?? raw.index, index);
  const title = pickFirstString(raw, ["title", "chapterTitle", "name", "chapterName"]) ?? `Chapter ${order}`;
  const summary = pickFirstString(raw, ["summary", "outline", "description", "content"]) ?? "";
  const purpose = pickFirstString(raw, ["purpose", "goal", "chapterGoal"]);
  const keyEvents = parseList(raw.key_events ?? raw.keyEvents ?? raw.events);
  const involvedRoles = parseList(raw.involved_roles ?? raw.involvedRoles ?? raw.roles ?? raw.characters);
  const conflictLevel = parseScore(raw.conflict_level ?? raw.conflictLevel);
  const revealLevel = parseScore(raw.reveal_level ?? raw.revealLevel);
  const pacing = pickFirstString(raw, ["pacing", "pace"]);
  const foreshadow = pickFirstString(raw, ["foreshadow", "foreshadowing", "hint"]);
  const mustAvoid = pickFirstString(raw, ["must_avoid", "mustAvoid", "forbidden"]);
  const targetWordCount = parsePositiveInteger(raw.target_word_count ?? raw.targetWordCount ?? raw.wordCount);
  const taskSheet = pickFirstString(raw, ["task_sheet", "taskSheet"]);

  if (!title.trim() && !summary.trim()) {
    return null;
  }
  return {
    order,
    title,
    summary,
    purpose: purpose ?? undefined,
    keyEvents: keyEvents.length > 0 ? keyEvents : undefined,
    involvedRoles: involvedRoles.length > 0 ? involvedRoles : undefined,
    conflictLevel,
    revealLevel,
    pacing: pacing ?? undefined,
    foreshadow: foreshadow ?? undefined,
    mustAvoid: mustAvoid ?? undefined,
    targetWordCount: targetWordCount ?? undefined,
    taskSheet: taskSheet ?? undefined,
  };
}

function normalizeStructuredVolume(raw: unknown, index: number): StructuredVolume | null {
  if (!isJsonRecord(raw)) {
    return null;
  }
  const volumeTitle = pickFirstString(raw, ["volumeTitle", "title", "name", "volume", "arcTitle"]) ?? `Volume ${index + 1}`;
  const rawChapters =
    (Array.isArray(raw.chapters) && raw.chapters)
    || (Array.isArray(raw.chapterList) && raw.chapterList)
    || (Array.isArray(raw.items) && raw.items)
    || (Array.isArray(raw.sections) && raw.sections)
    || [];
  const chapters = rawChapters
    .map((chapter, chapterIndex) => normalizeStructuredChapter(chapter, chapterIndex))
    .filter((chapter): chapter is StructuredChapter => chapter !== null)
    .sort((a, b) => a.order - b.order);
  if (chapters.length === 0) {
    return null;
  }
  return { volumeTitle, chapters };
}

export function parseStructuredVolumes(raw: string | null | undefined): StructuredVolume[] {
  if (!raw) {
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
      .map((volume, volumeIndex) => normalizeStructuredVolume(volume, volumeIndex))
      .filter((volume): volume is StructuredVolume => volume !== null);
    if (normalizedVolumes.length > 0) {
      return normalizedVolumes;
    }
    const chapters = volumeLikeList
      .map((chapter, chapterIndex) => normalizeStructuredChapter(chapter, chapterIndex))
      .filter((chapter): chapter is StructuredChapter => chapter !== null);
    if (chapters.length === 0) {
      return [];
    }
    return [{ volumeTitle: "Volume 1", chapters: chapters.sort((a, b) => a.order - b.order) }];
  } catch {
    return [];
  }
}

export function serializeStructuredVolumes(volumes: StructuredVolume[]): string {
  const output = volumes.map((volume) => ({
    volumeTitle: volume.volumeTitle,
    chapters: (volume.chapters ?? []).map((chapter) => {
      const payload: Record<string, unknown> = {
        order: chapter.order,
        title: chapter.title,
        summary: chapter.summary,
      };
      if (chapter.purpose?.trim()) payload.purpose = chapter.purpose.trim();
      if (chapter.keyEvents && chapter.keyEvents.length > 0) payload.key_events = chapter.keyEvents;
      if (chapter.involvedRoles && chapter.involvedRoles.length > 0) payload.involved_roles = chapter.involvedRoles;
      if (typeof chapter.conflictLevel === "number") payload.conflict_level = chapter.conflictLevel;
      if (typeof chapter.revealLevel === "number") payload.reveal_level = chapter.revealLevel;
      if (chapter.pacing?.trim()) payload.pacing = chapter.pacing.trim();
      if (chapter.foreshadow?.trim()) payload.foreshadow = chapter.foreshadow.trim();
      if (chapter.mustAvoid?.trim()) payload.must_avoid = chapter.mustAvoid.trim();
      if (typeof chapter.targetWordCount === "number") payload.target_word_count = chapter.targetWordCount;
      if (chapter.taskSheet?.trim()) payload.task_sheet = chapter.taskSheet.trim();
      return payload;
    }),
  }));
  return JSON.stringify(output, null, 2);
}

function compactList(items: string[] | undefined): string {
  if (!items || items.length === 0) {
    return "";
  }
  return items.join("、");
}

export function buildTaskSheetFromStructuredChapter(chapter: StructuredChapter): string {
  const lines: string[] = [];
  lines.push(`章节目标：${chapter.purpose || chapter.summary || "推动主线"}`);
  if (chapter.keyEvents && chapter.keyEvents.length > 0) {
    lines.push(`关键事件：${compactList(chapter.keyEvents)}`);
  }
  if (chapter.involvedRoles && chapter.involvedRoles.length > 0) {
    lines.push(`涉及角色：${compactList(chapter.involvedRoles)}`);
  }
  if (typeof chapter.conflictLevel === "number") {
    lines.push(`冲突等级：${chapter.conflictLevel}`);
  }
  if (typeof chapter.revealLevel === "number") {
    lines.push(`揭露等级：${chapter.revealLevel}`);
  }
  if (chapter.pacing?.trim()) {
    lines.push(`节奏：${chapter.pacing.trim()}`);
  }
  if (chapter.foreshadow?.trim()) {
    lines.push(`伏笔：${chapter.foreshadow.trim()}`);
  }
  if (chapter.mustAvoid?.trim()) {
    lines.push(`禁止事项：${chapter.mustAvoid.trim()}`);
  }
  return lines.join("\n");
}

export function applyStructuredChapterBatch(
  volumes: StructuredVolume[],
  patch: {
    conflictLevel?: number;
    targetWordCount?: number;
    generateTaskSheet?: boolean;
  },
): StructuredVolume[] {
  return volumes.map((volume) => ({
    ...volume,
    chapters: (volume.chapters ?? []).map((chapter) => {
      const nextChapter: StructuredChapter = { ...chapter };
      if (typeof patch.conflictLevel === "number") {
        nextChapter.conflictLevel = Math.max(0, Math.min(100, Math.round(patch.conflictLevel)));
      }
      if (typeof patch.targetWordCount === "number") {
        nextChapter.targetWordCount = Math.max(200, Math.round(patch.targetWordCount));
      }
      if (patch.generateTaskSheet) {
        nextChapter.taskSheet = buildTaskSheetFromStructuredChapter(nextChapter);
      }
      return nextChapter;
    }),
  }));
}
