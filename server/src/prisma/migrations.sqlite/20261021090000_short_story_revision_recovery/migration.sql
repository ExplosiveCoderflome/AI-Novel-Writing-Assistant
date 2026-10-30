-- AlterTable
ALTER TABLE "NovelWorkflowTask" ADD COLUMN "shortStoryOperationId" TEXT;

-- CreateTable
CREATE TABLE "ShortStoryRevisionJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowTaskId" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "intentVersionId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "baselineJson" TEXT NOT NULL,
    "candidatePlanJson" TEXT,
    "qualityDebtJson" TEXT,
    "lastError" TEXT,
    "leaseToken" TEXT,
    "leaseExpiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShortStoryRevisionJob_workflowTaskId_fkey" FOREIGN KEY ("workflowTaskId") REFERENCES "NovelWorkflowTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShortStoryRevisionJob_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShortStoryRevisionJob_intentVersionId_fkey" FOREIGN KEY ("intentVersionId") REFERENCES "NovelIntentVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShortStoryRevisionCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "targetWordCount" INTEGER NOT NULL,
    "continuitySummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShortStoryRevisionCandidate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ShortStoryRevisionJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ShortStoryRevisionJob_intentVersionId_key" ON "ShortStoryRevisionJob"("intentVersionId");

-- CreateIndex
CREATE INDEX "ShortStoryRevisionJob_workflowTaskId_status_idx" ON "ShortStoryRevisionJob"("workflowTaskId", "status");

-- CreateIndex
CREATE INDEX "ShortStoryRevisionJob_novelId_createdAt_idx" ON "ShortStoryRevisionJob"("novelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShortStoryRevisionCandidate_jobId_segmentId_key" ON "ShortStoryRevisionCandidate"("jobId", "segmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ShortStoryRevisionCandidate_jobId_order_key" ON "ShortStoryRevisionCandidate"("jobId", "order");
