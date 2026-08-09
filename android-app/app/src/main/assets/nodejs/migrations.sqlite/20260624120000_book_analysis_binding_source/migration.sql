ALTER TABLE "KnowledgeBinding" ADD COLUMN "sourceAnalysisId" TEXT;

CREATE INDEX "KnowledgeBinding_sourceAnalysisId_idx" ON "KnowledgeBinding"("sourceAnalysisId");
