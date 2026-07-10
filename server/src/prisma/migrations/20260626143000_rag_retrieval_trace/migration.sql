CREATE TABLE "RagRetrievalTrace" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL DEFAULT 'default',
  "novelId" TEXT,
  "worldId" TEXT,
  "queryDigest" TEXT NOT NULL,
  "queryPreview" TEXT,
  "scopeJson" TEXT,
  "candidateCounts" TEXT NOT NULL DEFAULT '{}',
  "hitsJson" TEXT NOT NULL DEFAULT '[]',
  "timingsJson" TEXT NOT NULL DEFAULT '{}',
  "fallbackTriggered" BOOLEAN NOT NULL DEFAULT false,
  "rerankerUsed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RagRetrievalTrace_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RagRetrievalTrace_tenantId_createdAt_idx" ON "RagRetrievalTrace"("tenantId", "createdAt");
CREATE INDEX "RagRetrievalTrace_tenantId_novelId_createdAt_idx" ON "RagRetrievalTrace"("tenantId", "novelId", "createdAt");
CREATE INDEX "RagRetrievalTrace_queryDigest_idx" ON "RagRetrievalTrace"("queryDigest");
