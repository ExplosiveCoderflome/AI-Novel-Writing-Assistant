CREATE TABLE "CreativeDecision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT NOT NULL,
  "chapterId" TEXT,
  "category" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "importance" TEXT NOT NULL DEFAULT 'normal',
  "expiresAt" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreativeDecision_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CreativeDecision_novelId_createdAt_idx" ON "CreativeDecision"("novelId", "createdAt");

CREATE TABLE "NovelSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT NOT NULL,
  "label" TEXT,
  "snapshotData" TEXT NOT NULL,
  "triggerType" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NovelSnapshot_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "NovelSnapshot_novelId_createdAt_idx" ON "NovelSnapshot"("novelId", "createdAt");
