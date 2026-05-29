CREATE TABLE "NovelSideEffectJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT,
  "jobType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "idempotencyKey" TEXT NOT NULL,
  "payloadVersion" INTEGER NOT NULL DEFAULT 1,
  "payloadJson" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "runAfter" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" TEXT,
  "leaseExpiresAt" DATETIME,
  "lastError" TEXT,
  "finishedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NovelSideEffectJob_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "NovelSideEffectJob_idempotencyKey_key" ON "NovelSideEffectJob"("idempotencyKey");
CREATE INDEX "NovelSideEffectJob_status_runAfter_idx" ON "NovelSideEffectJob"("status", "runAfter");
CREATE INDEX "NovelSideEffectJob_novelId_status_updatedAt_idx" ON "NovelSideEffectJob"("novelId", "status", "updatedAt");
CREATE INDEX "NovelSideEffectJob_leaseOwner_leaseExpiresAt_idx" ON "NovelSideEffectJob"("leaseOwner", "leaseExpiresAt");
CREATE INDEX "NovelSideEffectJob_jobType_status_runAfter_idx" ON "NovelSideEffectJob"("jobType", "status", "runAfter");
