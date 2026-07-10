CREATE TYPE "KnowledgeDocumentKind" AS ENUM ('user_upload', 'analysis_published');

ALTER TABLE "KnowledgeDocument"
  ADD COLUMN "kind" "KnowledgeDocumentKind" NOT NULL DEFAULT 'user_upload',
  ADD COLUMN "sourceAnalysisId" TEXT;

UPDATE "KnowledgeDocument" document
SET "kind" = 'analysis_published'
WHERE EXISTS (
  SELECT 1
  FROM "KnowledgeBinding" binding
  WHERE binding."documentId" = document."id"
    AND binding."sourceAnalysisId" IS NOT NULL
);

UPDATE "KnowledgeDocument" document
SET "sourceAnalysisId" = candidates."sourceAnalysisId"
FROM (
  SELECT
    binding."documentId",
    MIN(binding."sourceAnalysisId") AS "sourceAnalysisId"
  FROM "KnowledgeBinding" binding
  WHERE binding."sourceAnalysisId" IS NOT NULL
  GROUP BY binding."documentId"
  HAVING COUNT(DISTINCT binding."sourceAnalysisId") = 1
) candidates
WHERE document."id" = candidates."documentId"
  AND NOT EXISTS (
    SELECT 1
    FROM "KnowledgeBinding" duplicate_binding
    WHERE duplicate_binding."sourceAnalysisId" = candidates."sourceAnalysisId"
      AND duplicate_binding."documentId" <> candidates."documentId"
  );

CREATE UNIQUE INDEX "KnowledgeDocument_sourceAnalysisId_key" ON "KnowledgeDocument"("sourceAnalysisId");
CREATE INDEX "KnowledgeDocument_kind_updatedAt_idx" ON "KnowledgeDocument"("kind", "updatedAt");
