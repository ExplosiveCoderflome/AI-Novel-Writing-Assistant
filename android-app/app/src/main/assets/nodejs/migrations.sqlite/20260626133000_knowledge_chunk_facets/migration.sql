ALTER TABLE "KnowledgeChunk" ADD COLUMN "facetKeys" TEXT;
ALTER TABLE "KnowledgeChunk" ADD COLUMN "chapterAnchor" TEXT;

CREATE INDEX "KnowledgeChunk_facetKeys_idx" ON "KnowledgeChunk"("facetKeys");
CREATE INDEX "KnowledgeChunk_chapterAnchor_idx" ON "KnowledgeChunk"("chapterAnchor");
