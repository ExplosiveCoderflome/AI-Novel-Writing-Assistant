ALTER TABLE "Novel" ADD COLUMN "referenceBookAnalysisId" TEXT;
ALTER TABLE "Novel" ADD COLUMN "referenceBookAnalysisSections" TEXT;

CREATE INDEX "Novel_referenceBookAnalysisId_idx" ON "Novel"("referenceBookAnalysisId");
