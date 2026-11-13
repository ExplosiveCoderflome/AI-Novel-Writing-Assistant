PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShortStoryPlan" (
  "id" TEXT NOT NULL PRIMARY KEY,"novelId" TEXT NOT NULL,"intentVersionId" TEXT,"status" TEXT NOT NULL DEFAULT 'planning',
  "targetWordCount" INTEGER NOT NULL,"endingPromise" TEXT NOT NULL,"structureJson" TEXT NOT NULL,
  "qualityDebtJson" TEXT,"auditResultJson" TEXT,"schemaVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ShortStoryPlan_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ShortStoryPlan_intentVersionId_fkey" FOREIGN KEY ("intentVersionId") REFERENCES "NovelIntentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ShortStoryPlan" ("id","novelId","intentVersionId","status","targetWordCount","endingPromise","structureJson","qualityDebtJson","auditResultJson","schemaVersion","createdAt","updatedAt") SELECT "id","novelId","intentVersionId","status","targetWordCount","endingPromise","structureJson","qualityDebtJson","auditResultJson","schemaVersion","createdAt","updatedAt" FROM "ShortStoryPlan";
DROP TABLE "ShortStoryPlan";
ALTER TABLE "new_ShortStoryPlan" RENAME TO "ShortStoryPlan";
CREATE UNIQUE INDEX "ShortStoryPlan_novelId_key" ON "ShortStoryPlan"("novelId");
CREATE INDEX "ShortStoryPlan_intentVersionId_idx" ON "ShortStoryPlan"("intentVersionId");
CREATE INDEX "ShortStoryPlan_status_updatedAt_idx" ON "ShortStoryPlan"("status","updatedAt");
PRAGMA foreign_keys=ON;
