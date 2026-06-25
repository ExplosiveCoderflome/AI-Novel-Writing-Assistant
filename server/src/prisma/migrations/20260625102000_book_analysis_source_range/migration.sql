ALTER TABLE "BookAnalysis" ADD COLUMN "sourceStartChapterIndex" INTEGER;
ALTER TABLE "BookAnalysis" ADD COLUMN "sourceEndChapterIndex" INTEGER;
ALTER TABLE "BookAnalysis" ADD COLUMN "sourceStartOffset" INTEGER;
ALTER TABLE "BookAnalysis" ADD COLUMN "sourceEndOffset" INTEGER;
ALTER TABLE "BookAnalysis" ADD COLUMN "sourceScopeLabel" TEXT;

ALTER TABLE "BookAnalysisSourceCache" ADD COLUMN "sourceScopeKey" TEXT NOT NULL DEFAULT 'full';

DROP INDEX IF EXISTS "BookAnalysisSourceCache_documentVersionId_provider_model_te_key";
CREATE UNIQUE INDEX "BookAnalysisSourceCache_scope_unique"
  ON "BookAnalysisSourceCache"("documentVersionId", "sourceScopeKey", "provider", "model", "temperature", "notesMaxTokens", "segmentVersion");
