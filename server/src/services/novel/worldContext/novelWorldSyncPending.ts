import type { NovelWorldSyncSection } from "@ai-novel/shared/types/novelWorld";

const VALID_SYNC_SECTIONS = new Set<NovelWorldSyncSection>([
  "profile",
  "rules",
  "factions",
  "forces",
  "locations",
  "relations",
]);

export interface NovelWorldSyncPendingState {
  differenceCount: number;
  sections: NovelWorldSyncSection[];
  summary: string | null;
}

export function parseSyncPendingChanges(raw: string | null): NovelWorldSyncPendingState {
  if (!raw?.trim()) {
    return {
      differenceCount: 0,
      sections: [],
      summary: null,
    };
  }
  try {
    const parsed = JSON.parse(raw) as {
      differenceCount?: unknown;
      sections?: unknown;
      summary?: unknown;
    };
    return {
      differenceCount: typeof parsed.differenceCount === "number" ? parsed.differenceCount : 0,
      sections: Array.isArray(parsed.sections)
        ? parsed.sections.filter((section): section is NovelWorldSyncSection => (
          typeof section === "string" && VALID_SYNC_SECTIONS.has(section as NovelWorldSyncSection)
        ))
        : [],
      summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary : null,
    };
  } catch {
    return {
      differenceCount: 0,
      sections: [],
      summary: null,
    };
  }
}
