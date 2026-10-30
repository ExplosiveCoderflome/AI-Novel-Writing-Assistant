-- AlterTable
ALTER TABLE "NovelWorkflowTask" ADD COLUMN     "shortStoryOperationId" TEXT;

-- CreateTable
CREATE TABLE "ShortStoryRevisionJob" (
    "id" TEXT NOT NULL,
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
    "leaseExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShortStoryRevisionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShortStoryRevisionCandidate" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "targetWordCount" INTEGER NOT NULL,
    "continuitySummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShortStoryRevisionCandidate_pkey" PRIMARY KEY ("id")
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

-- AddForeignKey
ALTER TABLE "ShortStoryRevisionJob" ADD CONSTRAINT "ShortStoryRevisionJob_workflowTaskId_fkey" FOREIGN KEY ("workflowTaskId") REFERENCES "NovelWorkflowTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortStoryRevisionJob" ADD CONSTRAINT "ShortStoryRevisionJob_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortStoryRevisionJob" ADD CONSTRAINT "ShortStoryRevisionJob_intentVersionId_fkey" FOREIGN KEY ("intentVersionId") REFERENCES "NovelIntentVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortStoryRevisionCandidate" ADD CONSTRAINT "ShortStoryRevisionCandidate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ShortStoryRevisionJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
