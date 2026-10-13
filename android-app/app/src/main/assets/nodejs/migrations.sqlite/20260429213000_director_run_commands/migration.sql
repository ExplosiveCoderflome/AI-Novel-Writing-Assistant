CREATE TABLE "DirectorRunCommand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "novelId" TEXT,
    "commandType" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "leaseOwner" TEXT,
    "leaseExpiresAt" DATETIME,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "runAfter" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadJson" TEXT,
    "errorMessage" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DirectorRunCommand_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "NovelWorkflowTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DirectorRunCommand_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DirectorRunCommand_taskId_commandType_idempotencyKey_key" ON "DirectorRunCommand"("taskId", "commandType", "idempotencyKey");
CREATE INDEX "DirectorRunCommand_status_runAfter_updatedAt_idx" ON "DirectorRunCommand"("status", "runAfter", "updatedAt");
CREATE INDEX "DirectorRunCommand_taskId_status_updatedAt_idx" ON "DirectorRunCommand"("taskId", "status", "updatedAt");
CREATE INDEX "DirectorRunCommand_novelId_updatedAt_idx" ON "DirectorRunCommand"("novelId", "updatedAt");
CREATE INDEX "DirectorRunCommand_leaseOwner_leaseExpiresAt_idx" ON "DirectorRunCommand"("leaseOwner", "leaseExpiresAt");
