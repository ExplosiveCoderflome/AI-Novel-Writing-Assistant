-- Novel project strategy and workflow status
ALTER TABLE "Novel" ADD COLUMN "projectMode" TEXT;
ALTER TABLE "Novel" ADD COLUMN "narrativePov" TEXT;
ALTER TABLE "Novel" ADD COLUMN "pacePreference" TEXT;
ALTER TABLE "Novel" ADD COLUMN "styleTone" TEXT;
ALTER TABLE "Novel" ADD COLUMN "emotionIntensity" TEXT;
ALTER TABLE "Novel" ADD COLUMN "aiFreedom" TEXT;
ALTER TABLE "Novel" ADD COLUMN "defaultChapterLength" INTEGER;
ALTER TABLE "Novel" ADD COLUMN "projectStatus" TEXT DEFAULT 'not_started';
ALTER TABLE "Novel" ADD COLUMN "storylineStatus" TEXT DEFAULT 'not_started';
ALTER TABLE "Novel" ADD COLUMN "outlineStatus" TEXT DEFAULT 'not_started';
ALTER TABLE "Novel" ADD COLUMN "resourceReadyScore" INTEGER;

-- Chapter planning/execution fields
ALTER TABLE "Chapter" ADD COLUMN "chapterStatus" TEXT DEFAULT 'unplanned';
ALTER TABLE "Chapter" ADD COLUMN "targetWordCount" INTEGER;
ALTER TABLE "Chapter" ADD COLUMN "conflictLevel" INTEGER;
ALTER TABLE "Chapter" ADD COLUMN "revealLevel" INTEGER;
ALTER TABLE "Chapter" ADD COLUMN "mustAvoid" TEXT;
ALTER TABLE "Chapter" ADD COLUMN "taskSheet" TEXT;
ALTER TABLE "Chapter" ADD COLUMN "sceneCards" TEXT;
ALTER TABLE "Chapter" ADD COLUMN "repairHistory" TEXT;
ALTER TABLE "Chapter" ADD COLUMN "qualityScore" INTEGER;
ALTER TABLE "Chapter" ADD COLUMN "continuityScore" INTEGER;
ALTER TABLE "Chapter" ADD COLUMN "characterScore" INTEGER;
ALTER TABLE "Chapter" ADD COLUMN "pacingScore" INTEGER;
ALTER TABLE "Chapter" ADD COLUMN "riskFlags" TEXT;

-- Pipeline configuration fields
ALTER TABLE "GenerationJob" ADD COLUMN "runMode" TEXT DEFAULT 'fast';
ALTER TABLE "GenerationJob" ADD COLUMN "autoReview" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GenerationJob" ADD COLUMN "autoRepair" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GenerationJob" ADD COLUMN "skipCompleted" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "GenerationJob" ADD COLUMN "qualityThreshold" INTEGER;
ALTER TABLE "GenerationJob" ADD COLUMN "repairMode" TEXT DEFAULT 'light_repair';
ALTER TABLE "GenerationJob" ADD COLUMN "lastErrorType" TEXT;

-- Storyline versioning table
CREATE TABLE "StorylineVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "content" TEXT NOT NULL,
  "diffSummary" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "StorylineVersion_novelId_fkey"
    FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StorylineVersion_novelId_version_key" ON "StorylineVersion"("novelId", "version");
CREATE INDEX "StorylineVersion_novelId_status_createdAt_idx" ON "StorylineVersion"("novelId", "status", "createdAt");
