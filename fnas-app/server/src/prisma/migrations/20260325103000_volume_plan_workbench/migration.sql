CREATE TABLE "VolumePlanVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "contentJson" TEXT NOT NULL,
  "diffSummary" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "VolumePlanVersion_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "VolumePlanVersion_novelId_version_key" ON "VolumePlanVersion"("novelId", "version");
CREATE INDEX "VolumePlanVersion_novelId_status_createdAt_idx" ON "VolumePlanVersion"("novelId", "status", "createdAt");

CREATE TABLE "VolumePlan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "mainPromise" TEXT,
  "escalationMode" TEXT,
  "protagonistChange" TEXT,
  "climax" TEXT,
  "nextVolumeHook" TEXT,
  "resetPoint" TEXT,
  "openPayoffsJson" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "sourceVersionId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "VolumePlan_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VolumePlan_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "VolumePlanVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "VolumePlan_novelId_sortOrder_key" ON "VolumePlan"("novelId", "sortOrder");
CREATE INDEX "VolumePlan_novelId_status_sortOrder_idx" ON "VolumePlan"("novelId", "status", "sortOrder");
CREATE INDEX "VolumePlan_sourceVersionId_idx" ON "VolumePlan"("sourceVersionId");

CREATE TABLE "VolumeChapterPlan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "volumeId" TEXT NOT NULL,
  "chapterOrder" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "purpose" TEXT,
  "conflictLevel" INTEGER,
  "revealLevel" INTEGER,
  "targetWordCount" INTEGER,
  "mustAvoid" TEXT,
  "taskSheet" TEXT,
  "payoffRefsJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "VolumeChapterPlan_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "VolumePlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "VolumeChapterPlan_volumeId_chapterOrder_key" ON "VolumeChapterPlan"("volumeId", "chapterOrder");
CREATE INDEX "VolumeChapterPlan_volumeId_chapterOrder_idx" ON "VolumeChapterPlan"("volumeId", "chapterOrder");
