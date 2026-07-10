CREATE TABLE "BookAnalysisCharacter" (
  "id" TEXT NOT NULL,
  "analysisId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "generationDepth" TEXT NOT NULL DEFAULT 'standard',
  "selectedDimensionsJson" TEXT,
  "profileJson" TEXT NOT NULL,
  "evidenceJson" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookAnalysisCharacter_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookAnalysisCharacter_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "BookAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BookAnalysisCharacterArc" (
  "id" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "chapterIndex" INTEGER,
  "stageLabel" TEXT NOT NULL,
  "stateSnapshotJson" TEXT,
  "evidenceJson" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookAnalysisCharacterArc_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookAnalysisCharacterArc_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "BookAnalysisCharacter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BookAnalysisCharacterScene" (
  "id" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "sceneLabel" TEXT NOT NULL,
  "sceneType" TEXT,
  "performanceJson" TEXT,
  "evidenceJson" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookAnalysisCharacterScene_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookAnalysisCharacterScene_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "BookAnalysisCharacter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "BookAnalysisCharacter_analysisId_sortOrder_idx" ON "BookAnalysisCharacter"("analysisId", "sortOrder");
CREATE INDEX "BookAnalysisCharacter_analysisId_name_idx" ON "BookAnalysisCharacter"("analysisId", "name");
CREATE INDEX "BookAnalysisCharacterArc_characterId_sortOrder_idx" ON "BookAnalysisCharacterArc"("characterId", "sortOrder");
CREATE INDEX "BookAnalysisCharacterArc_chapterIndex_idx" ON "BookAnalysisCharacterArc"("chapterIndex");
CREATE INDEX "BookAnalysisCharacterScene_characterId_sortOrder_idx" ON "BookAnalysisCharacterScene"("characterId", "sortOrder");
