export interface StructuredVolume {
  volumeTitle: string;
  chapters: Array<{
    order: number;
    title: string;
    summary: string;
  }>;
}

type JsonRecord = Record<string, unknown>;

interface WorldContextSummaryInput {
  name: string;
  worldType?: string | null;
  description?: string | null;
  overviewSummary?: string | null;
  axioms?: string | null;
  magicSystem?: string | null;
  conflicts?: string | null;
}

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

function parseOrder(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const matched = value.match(/\d+/);
    if (!matched) {
      return null;
    }
    const parsed = Number.parseInt(matched[0], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function normalizeStructuredChapter(raw: unknown, index: number): StructuredVolume["chapters"][number] | null {
  if (!isJsonRecord(raw)) {
    return null;
  }
  const order = parseOrder(raw.order ?? raw.chapterOrder ?? raw.chapterNo ?? raw.chapter ?? raw.index) ?? index + 1;
  const rawTitle = pickFirstString(raw, ["title", "chapterTitle", "name", "chapterName"]);
  const rawSummary = pickFirstString(raw, ["summary", "outline", "description", "content"]);
  if (!rawTitle && !rawSummary) {
    return null;
  }
  const title = rawTitle ?? `Chapter ${order}`;
  const summary = rawSummary ?? "";
  return { order, title, summary };
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
    .filter((chapter): chapter is StructuredVolume["chapters"][number] => chapter !== null);
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
      .filter((chapter): chapter is StructuredVolume["chapters"][number] => chapter !== null);
    if (chapters.length === 0) {
      return [];
    }
    return [{ volumeTitle: "Volume 1", chapters }];
  } catch {
    return [];
  }
}

export function buildWorldInjectionSummary(world: WorldContextSummaryInput | null | undefined): string | null {
  if (!world) {
    return null;
  }

  let axioms: string[] = [];
  if (world.axioms?.trim()) {
    try {
      const parsed = JSON.parse(world.axioms) as string[];
      axioms = Array.isArray(parsed) ? parsed.filter((item) => item.trim()).slice(0, 3) : [];
    } catch {
      axioms = world.axioms
        .split(/[\n,，;；]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 3);
    }
  }

  const summaryBlock = world.overviewSummary?.trim() || world.description?.trim() || "No summary.";
  const magicBlock = world.magicSystem?.trim() ? world.magicSystem.trim().slice(0, 120) : "";
  const conflictBlock = world.conflicts?.trim() ? world.conflicts.trim().slice(0, 120) : "";

  const lines = [
    `${world.name}${world.worldType ? ` (${world.worldType})` : ""}`,
    `Summary: ${summaryBlock}`,
    ...(axioms.length > 0 ? [`Axioms: ${axioms.join(" | ")}`] : []),
    ...(magicBlock ? [`Power: ${magicBlock}`] : []),
    ...(conflictBlock ? [`Conflict: ${conflictBlock}`] : []),
  ];
  return lines.join("\n");
}
