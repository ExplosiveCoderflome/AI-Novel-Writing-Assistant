-- CreateTable
CREATE TABLE "BookAnalysisSourceCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentVersionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "temperature" REAL NOT NULL,
    "notesMaxTokens" INTEGER NOT NULL,
    "segmentVersion" INTEGER NOT NULL DEFAULT 1,
    "segmentCount" INTEGER NOT NULL,
    "notesJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BookAnalysisSourceCache_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "KnowledgeDocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BookAnalysisSourceCache_documentVersionId_provider_model_temperature_notesMaxTokens_segmentVersion_key"
ON "BookAnalysisSourceCache"("documentVersionId", "provider", "model", "temperature", "notesMaxTokens", "segmentVersion");

-- CreateIndex
CREATE INDEX "BookAnalysisSourceCache_documentVersionId_updatedAt_idx"
ON "BookAnalysisSourceCache"("documentVersionId", "updatedAt");
