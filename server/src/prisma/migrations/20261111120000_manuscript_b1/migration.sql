CREATE TABLE "ManuscriptProject" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT,
  "narrativeForm" TEXT NOT NULL DEFAULT 'long_novel',
  "activeSourceId" TEXT,
  "baselineOutlineRevisionId" TEXT,
  "workingOutlineProjectId" TEXT,
  "structureVersion" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'importing',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManuscriptProject_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ManuscriptProject_novelId_key" ON "ManuscriptProject"("novelId");
CREATE INDEX "ManuscriptProject_status_updatedAt_idx" ON "ManuscriptProject"("status", "updatedAt");

CREATE TABLE "ManuscriptSource" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "rawBytes" BYTEA NOT NULL,
  "originalFileName" TEXT,
  "mediaType" TEXT NOT NULL DEFAULT 'text/plain',
  "encoding" TEXT NOT NULL,
  "sourceText" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "rawHash" TEXT NOT NULL,
  "charCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManuscriptSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ManuscriptProject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ManuscriptSource_projectId_version_key" ON "ManuscriptSource"("projectId", "version");
CREATE INDEX "ManuscriptSource_sourceHash_idx" ON "ManuscriptSource"("sourceHash");

CREATE TABLE "ManuscriptImportSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'uploaded',
  "splitDocumentJson" TEXT,
  "coverageHash" TEXT,
  "taskId" TEXT,
  "promptReceiptJson" TEXT,
  "confirmedRequestKey" TEXT,
  "confirmedPayloadHash" TEXT,
  "createdNovelId" TEXT,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManuscriptImportSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ManuscriptProject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManuscriptImportSession_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ManuscriptSource"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ManuscriptImportSession_confirmedRequestKey_key" ON "ManuscriptImportSession"("confirmedRequestKey");
CREATE INDEX "ManuscriptImportSession_projectId_status_idx" ON "ManuscriptImportSession"("projectId", "status");

CREATE TABLE "ManuscriptUnit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "sourceId" TEXT,
  "sourceRangesJson" TEXT NOT NULL DEFAULT '[]',
  "originalTitle" TEXT NOT NULL,
  "sourceOrdinal" INTEGER,
  "workTargetType" TEXT NOT NULL DEFAULT 'chapter',
  "chapterId" TEXT,
  "segmentId" TEXT,
  "displayOrder" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "workingRevision" INTEGER NOT NULL DEFAULT 0,
  "contentHash" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManuscriptUnit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ManuscriptProject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManuscriptUnit_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ManuscriptSource"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ManuscriptUnit_projectId_status_displayOrder_idx" ON "ManuscriptUnit"("projectId", "status", "displayOrder");
CREATE INDEX "ManuscriptUnit_chapterId_idx" ON "ManuscriptUnit"("chapterId");

CREATE TABLE "ManuscriptRevisionProposal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "unitId" TEXT,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'generating',
  "baseStructureVersion" INTEGER NOT NULL,
  "baseUnitRevision" INTEGER,
  "baseContentHash" TEXT,
  "baselineOutlineRevisionId" TEXT,
  "baseWorkingOutlineRevisionId" TEXT,
  "dependenciesJson" TEXT NOT NULL DEFAULT '{}',
  "operationsJson" TEXT NOT NULL DEFAULT '[]',
  "promptId" TEXT,
  "promptVersion" TEXT,
  "requestKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "appliedReceiptJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManuscriptRevisionProposal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ManuscriptProject"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ManuscriptRevisionProposal_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "ManuscriptUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ManuscriptRevisionProposal_requestKey_key" ON "ManuscriptRevisionProposal"("requestKey");
CREATE INDEX "ManuscriptRevisionProposal_projectId_status_createdAt_idx" ON "ManuscriptRevisionProposal"("projectId", "status", "createdAt");
