CREATE TABLE "DirectorNextEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "promptVersion" TEXT,
    "model" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectorNextEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DirectorNextRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DirectorNextEvent_runId_createdAt_idx" ON "DirectorNextEvent"("runId", "createdAt");
CREATE UNIQUE INDEX "DirectorNextEvent_runId_seq_key" ON "DirectorNextEvent"("runId", "seq");
