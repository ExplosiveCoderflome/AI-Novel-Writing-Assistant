ALTER TABLE "KnowledgeDocument" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'user_upload';
ALTER TABLE "KnowledgeDocument" ADD COLUMN "sourceAnalysisId" TEXT;

UPDATE "KnowledgeDocument"
SET "kind" = 'analysis_published'
WHERE EXISTS (
  SELECT 1
  FROM "KnowledgeBinding"
  WHERE "KnowledgeBinding"."documentId" = "KnowledgeDocument"."id"
    AND "KnowledgeBinding"."sourceAnalysisId" IS NOT NULL
);

UPDATE "KnowledgeDocument"
SET "sourceAnalysisId" = (
  SELECT MIN("KnowledgeBinding"."sourceAnalysisId")
  FROM "KnowledgeBinding"
  WHERE "KnowledgeBinding"."documentId" = "KnowledgeDocument"."id"
    AND "KnowledgeBinding"."sourceAnalysisId" IS NOT NULL
)
WHERE (
  SELECT COUNT(DISTINCT "KnowledgeBinding"."sourceAnalysisId")
  FROM "KnowledgeBinding"
  WHERE "KnowledgeBinding"."documentId" = "KnowledgeDocument"."id"
    AND "KnowledgeBinding"."sourceAnalysisId" IS NOT NULL
) = 1
AND NOT EXISTS (
  SELECT 1
  FROM "KnowledgeBinding" AS "duplicate_binding"
  WHERE "duplicate_binding"."sourceAnalysisId" = (
    SELECT MIN("KnowledgeBinding"."sourceAnalysisId")
    FROM "KnowledgeBinding"
    WHERE "KnowledgeBinding"."documentId" = "KnowledgeDocument"."id"
      AND "KnowledgeBinding"."sourceAnalysisId" IS NOT NULL
  )
    AND "duplicate_binding"."documentId" <> "KnowledgeDocument"."id"
);

CREATE UNIQUE INDEX "KnowledgeDocument_sourceAnalysisId_key" ON "KnowledgeDocument"("sourceAnalysisId");
CREATE INDEX "KnowledgeDocument_kind_updatedAt_idx" ON "KnowledgeDocument"("kind", "updatedAt");
