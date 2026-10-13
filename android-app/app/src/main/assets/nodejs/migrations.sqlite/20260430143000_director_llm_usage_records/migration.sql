CREATE TABLE "DirectorLlmUsageRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT,
    "taskId" TEXT,
    "runId" TEXT,
    "stepIdempotencyKey" TEXT,
    "nodeKey" TEXT,
    "promptAssetKey" TEXT,
    "promptVersion" TEXT,
    "modelRoute" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'recorded',
    "attributionStatus" TEXT NOT NULL DEFAULT 'unattributed',
    "durationMs" INTEGER,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" TEXT,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectorLlmUsageRecord_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DirectorLlmUsageRecord_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "NovelWorkflowTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DirectorLlmUsageRecord_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DirectorRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DirectorLlmUsageRecord_stepIdempotencyKey_fkey" FOREIGN KEY ("stepIdempotencyKey") REFERENCES "DirectorStepRun" ("idempotencyKey") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "DirectorLlmUsageRecord_novelId_recordedAt_idx" ON "DirectorLlmUsageRecord"("novelId", "recordedAt");
CREATE INDEX "DirectorLlmUsageRecord_taskId_recordedAt_idx" ON "DirectorLlmUsageRecord"("taskId", "recordedAt");
CREATE INDEX "DirectorLlmUsageRecord_runId_recordedAt_idx" ON "DirectorLlmUsageRecord"("runId", "recordedAt");
CREATE INDEX "DirectorLlmUsageRecord_stepIdempotencyKey_recordedAt_idx" ON "DirectorLlmUsageRecord"("stepIdempotencyKey", "recordedAt");
CREATE INDEX "DirectorLlmUsageRecord_nodeKey_recordedAt_idx" ON "DirectorLlmUsageRecord"("nodeKey", "recordedAt");
CREATE INDEX "DirectorLlmUsageRecord_attributionStatus_recordedAt_idx" ON "DirectorLlmUsageRecord"("attributionStatus", "recordedAt");
