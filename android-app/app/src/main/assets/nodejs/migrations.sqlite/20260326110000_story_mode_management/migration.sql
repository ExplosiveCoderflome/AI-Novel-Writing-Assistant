CREATE TABLE "NovelStoryMode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "template" TEXT,
  "profileJson" TEXT NOT NULL,
  "parentId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "NovelStoryMode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NovelStoryMode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "NovelStoryMode_parentId_idx" ON "NovelStoryMode"("parentId");

ALTER TABLE "Novel" ADD COLUMN "primaryStoryModeId" TEXT;
ALTER TABLE "Novel" ADD COLUMN "secondaryStoryModeId" TEXT;

CREATE INDEX "Novel_primaryStoryModeId_idx" ON "Novel"("primaryStoryModeId");
CREATE INDEX "Novel_secondaryStoryModeId_idx" ON "Novel"("secondaryStoryModeId");
