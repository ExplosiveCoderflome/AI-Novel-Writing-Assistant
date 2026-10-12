ALTER TABLE "Novel" ADD COLUMN "referenceBookAnalysisId" TEXT;
ALTER TABLE "Novel" ADD COLUMN "referenceBookAnalysisSections" TEXT;

CREATE INDEX "Novel_referenceBookAnalysisId_idx" ON "Novel"("referenceBookAnalysisId");

ALTER TABLE "Novel" ADD CONSTRAINT "Novel_referenceBookAnalysisId_fkey"
  FOREIGN KEY ("referenceBookAnalysisId") REFERENCES "BookAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
