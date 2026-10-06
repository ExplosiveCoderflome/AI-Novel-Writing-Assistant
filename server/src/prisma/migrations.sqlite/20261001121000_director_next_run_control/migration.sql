CREATE TABLE "DirectorNextRunControl" (
    "runId" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "pauseJson" TEXT,
    "gateJson" TEXT,
    "cursorStepId" TEXT,
    "failureReason" TEXT,
    "leaseOwner" TEXT,
    "leaseExpiresAt" DATETIME,
    "heartbeatAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DirectorNextRunControl_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DirectorNextRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DirectorNextRunControl_novelId_status_idx" ON "DirectorNextRunControl"("novelId", "status");
