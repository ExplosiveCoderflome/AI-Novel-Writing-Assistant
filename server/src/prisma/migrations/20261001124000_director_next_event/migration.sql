CREATE TABLE "DirectorNextEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "promptVersion" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectorNextEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DirectorNextEvent_runId_createdAt_idx" ON "DirectorNextEvent"("runId", "createdAt");
CREATE UNIQUE INDEX "DirectorNextEvent_runId_seq_key" ON "DirectorNextEvent"("runId", "seq");
ALTER TABLE "DirectorNextEvent" ADD CONSTRAINT "DirectorNextEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DirectorNextRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
