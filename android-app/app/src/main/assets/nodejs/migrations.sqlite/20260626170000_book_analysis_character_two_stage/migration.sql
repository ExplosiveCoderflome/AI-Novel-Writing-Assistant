PRAGMA foreign_keys=OFF;

CREATE TABLE "new_BookAnalysisCharacter" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "analysisId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'generated',
  "briefDescription" TEXT,
  "importance" TEXT,
  "occurringChaptersJson" TEXT,
  "lastGenerationError" TEXT,
  "generationDepth" TEXT NOT NULL DEFAULT 'standard',
  "selectedDimensionsJson" TEXT,
  "profileJson" TEXT,
  "evidenceJson" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "BookAnalysisCharacter_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "BookAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_BookAnalysisCharacter" (
  "id",
  "analysisId",
  "name",
  "role",
  "status",
  "generationDepth",
  "selectedDimensionsJson",
  "profileJson",
  "evidenceJson",
  "sortOrder",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "analysisId",
  "name",
  "role",
  CASE
    WHEN "profileJson" IS NOT NULL AND "profileJson" <> '{}' THEN 'generated'
    ELSE 'candidate'
  END,
  "generationDepth",
  "selectedDimensionsJson",
  "profileJson",
  "evidenceJson",
  "sortOrder",
  "createdAt",
  "updatedAt"
FROM "BookAnalysisCharacter";

DROP TABLE "BookAnalysisCharacter";
ALTER TABLE "new_BookAnalysisCharacter" RENAME TO "BookAnalysisCharacter";

CREATE INDEX "BookAnalysisCharacter_analysisId_sortOrder_idx" ON "BookAnalysisCharacter"("analysisId", "sortOrder");
CREATE INDEX "BookAnalysisCharacter_analysisId_name_idx" ON "BookAnalysisCharacter"("analysisId", "name");
CREATE INDEX "BookAnalysisCharacter_analysisId_status_idx" ON "BookAnalysisCharacter"("analysisId", "status");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
