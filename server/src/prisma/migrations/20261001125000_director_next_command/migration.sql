CREATE TABLE "DirectorNextCommand" (
    "idempotencyKey" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "resultJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectorNextCommand_pkey" PRIMARY KEY ("idempotencyKey")
);
CREATE UNIQUE INDEX "DirectorNextCommand_id_key" ON "DirectorNextCommand"("id");
CREATE INDEX "DirectorNextCommand_runId_createdAt_idx" ON "DirectorNextCommand"("runId", "createdAt");
ALTER TABLE "DirectorNextCommand" ADD CONSTRAINT "DirectorNextCommand_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DirectorNextRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
