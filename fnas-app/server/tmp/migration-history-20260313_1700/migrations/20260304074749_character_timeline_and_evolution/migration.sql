-- AlterTable
ALTER TABLE "Character" ADD COLUMN "currentGoal" TEXT;
ALTER TABLE "Character" ADD COLUMN "currentState" TEXT;
ALTER TABLE "Character" ADD COLUMN "lastEvolvedAt" DATETIME;

-- CreateTable
CREATE TABLE "CharacterTimeline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "chapterId" TEXT,
    "chapterOrder" INTEGER,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharacterTimeline_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterTimeline_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterTimeline_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CharacterTimeline_novelId_characterId_idx" ON "CharacterTimeline"("novelId", "characterId");

-- CreateIndex
CREATE INDEX "CharacterTimeline_characterId_chapterOrder_idx" ON "CharacterTimeline"("characterId", "chapterOrder");

-- CreateIndex
CREATE INDEX "CharacterTimeline_chapterId_idx" ON "CharacterTimeline"("chapterId");
