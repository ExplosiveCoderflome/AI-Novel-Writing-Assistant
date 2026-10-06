CREATE TABLE "DirectorNextRunControl" (
    "runId" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "pauseJson" TEXT,
    "gateJson" TEXT,
    "cursorStepId" TEXT,
    "failureReason" TEXT,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DirectorNextRunControl_pkey" PRIMARY KEY ("runId")
);
CREATE INDEX "DirectorNextRunControl_novelId_status_idx" ON "DirectorNextRunControl"("novelId", "status");
ALTER TABLE "DirectorNextRunControl" ADD CONSTRAINT "DirectorNextRunControl_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DirectorNextRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
