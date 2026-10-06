CREATE TABLE "LlmInvocationUsageRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runId" TEXT,
  "generationJobId" TEXT,
  "workflowTaskId" TEXT,
  "novelId" TEXT,
  "chapterId" TEXT,
  "stage" TEXT,
  "provider" TEXT,
  "model" TEXT,
  "requestProtocol" TEXT NOT NULL,
  "promptId" TEXT,
  "promptVersion" TEXT,
  "status" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3) NOT NULL,
  "promptTokens" INTEGER,
  "completionTokens" INTEGER,
  "totalTokens" INTEGER,
  "cacheHitTokens" INTEGER,
  "cacheMissTokens" INTEGER,
  "cacheWriteTokens" INTEGER,
  "cacheUsageStatus" TEXT NOT NULL,
  "cacheDiagnostic" TEXT
);
CREATE INDEX "LlmInvocationUsageRecord_runId_startedAt_id_idx" ON "LlmInvocationUsageRecord" ("runId", "startedAt", "id");
CREATE INDEX "LlmInvocationUsageRecord_generationJobId_startedAt_id_idx" ON "LlmInvocationUsageRecord" ("generationJobId", "startedAt", "id");
CREATE INDEX "LlmInvocationUsageRecord_novelId_chapterId_startedAt_id_idx" ON "LlmInvocationUsageRecord" ("novelId", "chapterId", "startedAt", "id");
