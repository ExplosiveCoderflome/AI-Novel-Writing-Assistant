-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BookAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "summary" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "temperature" REAL,
    "maxTokens" INTEGER,
    "progress" REAL NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastRunAt" DATETIME,
    "publishedDocumentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BookAnalysis_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BookAnalysis_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "KnowledgeDocumentVersion" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "BookAnalysis_publishedDocumentId_fkey" FOREIGN KEY ("publishedDocumentId") REFERENCES "KnowledgeDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BookAnalysis" ("createdAt", "documentId", "documentVersionId", "id", "lastError", "lastRunAt", "maxTokens", "model", "progress", "provider", "status", "summary", "temperature", "title", "updatedAt") SELECT "createdAt", "documentId", "documentVersionId", "id", "lastError", "lastRunAt", "maxTokens", "model", "progress", "provider", "status", "summary", "temperature", "title", "updatedAt" FROM "BookAnalysis";
DROP TABLE "BookAnalysis";
ALTER TABLE "new_BookAnalysis" RENAME TO "BookAnalysis";
CREATE INDEX "BookAnalysis_documentId_status_idx" ON "BookAnalysis"("documentId", "status");
CREATE INDEX "BookAnalysis_documentVersionId_idx" ON "BookAnalysis"("documentVersionId");
CREATE INDEX "BookAnalysis_status_updatedAt_idx" ON "BookAnalysis"("status", "updatedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
