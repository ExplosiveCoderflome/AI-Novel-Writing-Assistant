CREATE TABLE "DocumentChapter" (
  "id" TEXT NOT NULL,
  "documentVersionId" TEXT NOT NULL,
  "chapterIndex" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "startOffset" INTEGER NOT NULL,
  "endOffset" INTEGER NOT NULL,
  "charCount" INTEGER NOT NULL,
  "summary" TEXT,
  "splitter" TEXT NOT NULL DEFAULT 'rule',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentChapter_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DocumentChapter_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "KnowledgeDocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DocumentChapter_documentVersionId_chapterIndex_key" ON "DocumentChapter"("documentVersionId", "chapterIndex");
CREATE INDEX "DocumentChapter_documentVersionId_startOffset_idx" ON "DocumentChapter"("documentVersionId", "startOffset");
