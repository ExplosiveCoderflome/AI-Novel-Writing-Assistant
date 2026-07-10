ALTER TABLE "BookAnalysisCharacter" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'generated';
ALTER TABLE "BookAnalysisCharacter" ADD COLUMN "briefDescription" TEXT;
ALTER TABLE "BookAnalysisCharacter" ADD COLUMN "importance" TEXT;
ALTER TABLE "BookAnalysisCharacter" ADD COLUMN "occurringChaptersJson" TEXT;
ALTER TABLE "BookAnalysisCharacter" ADD COLUMN "lastGenerationError" TEXT;
ALTER TABLE "BookAnalysisCharacter" ALTER COLUMN "profileJson" DROP NOT NULL;

UPDATE "BookAnalysisCharacter"
SET "status" = 'generated'
WHERE "profileJson" IS NOT NULL AND "profileJson" <> '{}';

CREATE INDEX "BookAnalysisCharacter_analysisId_status_idx" ON "BookAnalysisCharacter"("analysisId", "status");
