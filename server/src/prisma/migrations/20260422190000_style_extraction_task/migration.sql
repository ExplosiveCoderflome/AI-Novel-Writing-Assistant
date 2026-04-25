CREATE TABLE "StyleExtractionTask" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "sourceText" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "temperature" DOUBLE PRECISION,
    "presetKey" TEXT NOT NULL DEFAULT 'balanced',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 1,
    "pendingManualRecovery" BOOLEAN NOT NULL DEFAULT false,
    "heartbeatAt" TIMESTAMP(3),
    "currentStage" TEXT,
    "currentItemKey" TEXT,
    "currentItemLabel" TEXT,
    "cancelRequestedAt" TIMESTAMP(3),
    "error" TEXT,
    "summary" TEXT,
    "createdStyleProfileId" TEXT,
    "createdStyleProfileName" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "llmCallCount" INTEGER NOT NULL DEFAULT 0,
    "lastTokenRecordedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleExtractionTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StyleExtractionTask_status_updatedAt_idx" ON "StyleExtractionTask"("status", "updatedAt");
CREATE INDEX "StyleExtractionTask_createdStyleProfileId_idx" ON "StyleExtractionTask"("createdStyleProfileId");
