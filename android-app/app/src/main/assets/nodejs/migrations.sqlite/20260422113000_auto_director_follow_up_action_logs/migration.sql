CREATE TABLE "AutoDirectorFollowUpActionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "actionCode" TEXT NOT NULL,
    "sourceChannel" TEXT NOT NULL,
    "sourceUser" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "resultCode" TEXT NOT NULL,
    "failureReason" TEXT,
    "metadataJson" TEXT,
    "executedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "AutoDirectorFollowUpActionLog_idempotencyKey_key"
ON "AutoDirectorFollowUpActionLog"("idempotencyKey");

CREATE INDEX "AutoDirectorFollowUpActionLog_taskId_executedAt_idx"
ON "AutoDirectorFollowUpActionLog"("taskId", "executedAt");

CREATE INDEX "AutoDirectorFollowUpActionLog_taskId_actionCode_executedAt_idx"
ON "AutoDirectorFollowUpActionLog"("taskId", "actionCode", "executedAt");
