ALTER TABLE "Novel" ADD COLUMN "narrativeForm" TEXT NOT NULL DEFAULT 'long_novel';
ALTER TABLE "Novel" ADD COLUMN "targetWordCount" INTEGER;
ALTER TABLE "Novel" ADD COLUMN "derivedFromNovelId" TEXT REFERENCES "Novel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "NovelIntentVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT,
  "workflowTaskId" TEXT NOT NULL,
  "previousVersionId" TEXT,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'proposed',
  "source" TEXT NOT NULL DEFAULT 'initial',
  "originalExpression" TEXT NOT NULL,
  "structuredIntentJson" TEXT NOT NULL,
  "impactScopeJson" TEXT,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "NovelIntentVersion_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NovelIntentVersion_workflowTaskId_fkey" FOREIGN KEY ("workflowTaskId") REFERENCES "NovelWorkflowTask"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NovelIntentVersion_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "NovelIntentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ShortStoryPlan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT NOT NULL,
  "intentVersionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'planning',
  "targetWordCount" INTEGER NOT NULL,
  "endingPromise" TEXT NOT NULL,
  "structureJson" TEXT NOT NULL,
  "qualityDebtJson" TEXT,
  "auditResultJson" TEXT,
  "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ShortStoryPlan_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ShortStoryPlan_intentVersionId_fkey" FOREIGN KEY ("intentVersionId") REFERENCES "NovelIntentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ShortStorySegment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "planId" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "targetWordCount" INTEGER NOT NULL,
  "content" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "version" INTEGER NOT NULL DEFAULT 1,
  "qualityResultJson" TEXT,
  "humanSnapshotJson" TEXT,
  "userEditedAt" DATETIME,
  "generatedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ShortStorySegment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ShortStoryPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ShortStorySegment_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "NovelIntentVersion_workflowTaskId_version_key" ON "NovelIntentVersion"("workflowTaskId", "version");
CREATE INDEX "NovelIntentVersion_novelId_status_version_idx" ON "NovelIntentVersion"("novelId", "status", "version");
CREATE INDEX "NovelIntentVersion_previousVersionId_idx" ON "NovelIntentVersion"("previousVersionId");
CREATE UNIQUE INDEX "ShortStoryPlan_novelId_key" ON "ShortStoryPlan"("novelId");
CREATE INDEX "ShortStoryPlan_intentVersionId_idx" ON "ShortStoryPlan"("intentVersionId");
CREATE INDEX "ShortStoryPlan_status_updatedAt_idx" ON "ShortStoryPlan"("status", "updatedAt");
CREATE UNIQUE INDEX "ShortStorySegment_planId_order_key" ON "ShortStorySegment"("planId", "order");
CREATE INDEX "ShortStorySegment_novelId_order_idx" ON "ShortStorySegment"("novelId", "order");
CREATE INDEX "ShortStorySegment_status_updatedAt_idx" ON "ShortStorySegment"("status", "updatedAt");
CREATE INDEX "Novel_derivedFromNovelId_idx" ON "Novel"("derivedFromNovelId");
CREATE INDEX "Novel_narrativeForm_idx" ON "Novel"("narrativeForm");
