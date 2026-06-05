import type { NovelWorldSyncRecordSummary, NovelWorldSyncSection } from "@ai-novel/shared/types/novelWorld";
import { prisma } from "../../../db/prisma";

interface WorldSyncRecordRow {
  id: string;
  direction: string;
  syncedFieldsJson: string | null;
  diffSummary: string | null;
  triggeredBy: string;
  createdAt: Date | string;
}

const VALID_SYNC_SECTIONS = new Set<NovelWorldSyncSection>([
  "profile",
  "rules",
  "factions",
  "forces",
  "locations",
  "relations",
]);

function parseSyncedSections(raw: string | null): NovelWorldSyncSection[] {
  if (!raw?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((section): section is NovelWorldSyncSection => (
      typeof section === "string" && VALID_SYNC_SECTIONS.has(section as NovelWorldSyncSection)
    ));
  } catch {
    return [];
  }
}

export async function listNovelWorldSyncRecords(
  novelWorldId: string | null | undefined,
  limit = 5,
): Promise<NovelWorldSyncRecordSummary[]> {
  if (!novelWorldId) {
    return [];
  }
  const rows = await prisma.$queryRaw<WorldSyncRecordRow[]>`
    SELECT
      "id",
      "direction",
      "syncedFieldsJson",
      "diffSummary",
      "triggeredBy",
      "createdAt"
    FROM "WorldSyncRecord"
    WHERE "novelWorldId" = ${novelWorldId}
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: row.id,
    direction: row.direction,
    syncedSections: parseSyncedSections(row.syncedFieldsJson),
    diffSummary: row.diffSummary,
    triggeredBy: row.triggeredBy,
    createdAt: new Date(row.createdAt).toISOString(),
  }));
}
