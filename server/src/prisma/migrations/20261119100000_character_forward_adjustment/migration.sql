CREATE TABLE "CharacterForwardAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "effectiveFromChapterOrder" INTEGER NOT NULL,
    "beforeJson" TEXT NOT NULL,
    "afterJson" TEXT NOT NULL,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CharacterForwardAdjustment_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterForwardAdjustment_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CharacterForwardAdjustment_character_revision_key" ON "CharacterForwardAdjustment"("characterId", "revision");
CREATE INDEX "CharacterForwardAdjustment_novel_chapter_idx" ON "CharacterForwardAdjustment"("novelId", "effectiveFromChapterOrder");
