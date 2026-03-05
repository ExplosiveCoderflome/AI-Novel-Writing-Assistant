-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "novelId" TEXT,
    "worldId" TEXT,
    "title" TEXT,
    "chunkText" TEXT NOT NULL,
    "chunkHash" TEXT NOT NULL,
    "chunkOrder" INTEGER NOT NULL,
    "tokenEstimate" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT NOT NULL DEFAULT 'zh',
    "metadataJson" TEXT,
    "embedProvider" TEXT NOT NULL,
    "embedModel" TEXT NOT NULL,
    "embedVersion" INTEGER NOT NULL DEFAULT 1,
    "indexedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RagIndexJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "jobType" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAfter" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadJson" TEXT,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "KnowledgeChunk_tenantId_ownerType_ownerId_idx" ON "KnowledgeChunk"("tenantId", "ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_tenantId_novelId_idx" ON "KnowledgeChunk"("tenantId", "novelId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_tenantId_worldId_idx" ON "KnowledgeChunk"("tenantId", "worldId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_chunkHash_idx" ON "KnowledgeChunk"("chunkHash");

-- CreateIndex
CREATE INDEX "RagIndexJob_status_runAfter_idx" ON "RagIndexJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "RagIndexJob_tenantId_ownerType_ownerId_idx" ON "RagIndexJob"("tenantId", "ownerType", "ownerId");
