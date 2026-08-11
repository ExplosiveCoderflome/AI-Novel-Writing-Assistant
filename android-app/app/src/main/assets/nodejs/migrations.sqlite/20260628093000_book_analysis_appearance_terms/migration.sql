CREATE TABLE "BookAnalysisCharacterAppearanceTerm" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "characterId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "chapterIndex" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "category" TEXT,
  "confidence" REAL,
  "stability" TEXT,
  "evidenceJson" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookAnalysisCharacterAppearanceTerm_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "BookAnalysisCharacter" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BookAnalysisCharacterAppearanceTerm_snapshotId_fkey"
    FOREIGN KEY ("snapshotId") REFERENCES "BookAnalysisCharacterAppearanceSnapshot" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BookAnalysisCharacterAppearanceTerm_snapshotId_text_key"
  ON "BookAnalysisCharacterAppearanceTerm"("snapshotId", "text");
CREATE INDEX "BookAnalysisCharacterAppearanceTerm_characterId_status_updatedAt_idx"
  ON "BookAnalysisCharacterAppearanceTerm"("characterId", "status", "updatedAt");
CREATE INDEX "BookAnalysisCharacterAppearanceTerm_snapshotId_idx"
  ON "BookAnalysisCharacterAppearanceTerm"("snapshotId");
CREATE INDEX "BookAnalysisCharacterAppearanceTerm_chapterIndex_idx"
  ON "BookAnalysisCharacterAppearanceTerm"("chapterIndex");
