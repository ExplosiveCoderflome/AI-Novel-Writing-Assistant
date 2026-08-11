CREATE TABLE "NovelWorld" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "sourceWorldId" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'manual',
    "title" TEXT,
    "coverSummary" TEXT,
    "structuredDataJson" TEXT,
    "bindingContractJson" TEXT,
    "storySliceJson" TEXT,
    "storySliceOverridesJson" TEXT,
    "storySliceSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "storySliceBuiltAt" DATETIME,
    "storySliceDigest" TEXT,
    "syncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "syncDirection" TEXT NOT NULL DEFAULT 'none',
    "syncBaseVersion" INTEGER,
    "syncPendingChangesJson" TEXT,
    "lastSyncedAt" DATETIME,
    "generationPolicyJson" TEXT,
    "generatedFromThemeJson" TEXT,
    "savedToLibraryAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NovelWorld_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NovelWorld_sourceWorldId_fkey" FOREIGN KEY ("sourceWorldId") REFERENCES "World" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "WorldSyncRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelWorldId" TEXT NOT NULL,
    "sourceWorldId" TEXT,
    "direction" TEXT NOT NULL,
    "syncedFieldsJson" TEXT,
    "diffSummary" TEXT,
    "triggeredBy" TEXT NOT NULL DEFAULT 'user',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorldSyncRecord_novelWorldId_fkey" FOREIGN KEY ("novelWorldId") REFERENCES "NovelWorld" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "NovelWorld_novelId_key" ON "NovelWorld"("novelId");
CREATE INDEX "NovelWorld_sourceWorldId_idx" ON "NovelWorld"("sourceWorldId");
CREATE INDEX "NovelWorld_sourceType_idx" ON "NovelWorld"("sourceType");
CREATE INDEX "WorldSyncRecord_novelWorldId_createdAt_idx" ON "WorldSyncRecord"("novelWorldId", "createdAt");
CREATE INDEX "WorldSyncRecord_sourceWorldId_idx" ON "WorldSyncRecord"("sourceWorldId");

INSERT INTO "NovelWorld" (
    "id",
    "novelId",
    "sourceWorldId",
    "sourceType",
    "title",
    "coverSummary",
    "structuredDataJson",
    "bindingContractJson",
    "storySliceJson",
    "storySliceOverridesJson",
    "storySliceSchemaVersion",
    "storySliceBuiltAt",
    "storySliceDigest",
    "syncEnabled",
    "syncDirection",
    "syncBaseVersion",
    "createdAt",
    "updatedAt"
)
SELECT
    'novel_world_' || n."id",
    n."id",
    n."worldId",
    CASE WHEN n."worldId" IS NOT NULL THEN 'imported' ELSE 'manual' END,
    w."name",
    COALESCE(w."overviewSummary", w."description"),
    w."structureJson",
    w."bindingSupportJson",
    n."storyWorldSliceJson",
    n."storyWorldSliceOverridesJson",
    n."storyWorldSliceSchemaVersion",
    CASE WHEN n."storyWorldSliceJson" IS NOT NULL THEN n."updatedAt" ELSE NULL END,
    NULL,
    false,
    'none',
    w."version",
    n."createdAt",
    n."updatedAt"
FROM "Novel" n
LEFT JOIN "World" w ON w."id" = n."worldId"
WHERE n."worldId" IS NOT NULL
   OR n."storyWorldSliceJson" IS NOT NULL
   OR n."storyWorldSliceOverridesJson" IS NOT NULL;
