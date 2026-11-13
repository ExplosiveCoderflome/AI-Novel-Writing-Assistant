CREATE TABLE "CreativeHubThread" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL DEFAULT '新对话',
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'idle',
  "latestRunId" TEXT,
  "latestError" TEXT,
  "resourceBindingsJson" TEXT,
  "metadataJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreativeHubThread_status_check"
    CHECK ("status" IN ('idle', 'busy', 'interrupted', 'error'))
);

CREATE TABLE "CreativeHubCheckpoint" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "threadId" TEXT NOT NULL,
  "checkpointId" TEXT NOT NULL,
  "parentCheckpointId" TEXT,
  "runId" TEXT,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "preview" TEXT,
  "messagesJson" TEXT NOT NULL,
  "interruptsJson" TEXT,
  "metadataJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreativeHubCheckpoint_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "CreativeHubThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CreativeHubCheckpoint_threadId_checkpointId_key"
ON "CreativeHubCheckpoint"("threadId", "checkpointId");

CREATE INDEX "CreativeHubThread_archived_updatedAt_idx"
ON "CreativeHubThread"("archived", "updatedAt");

CREATE INDEX "CreativeHubThread_status_updatedAt_idx"
ON "CreativeHubThread"("status", "updatedAt");

CREATE INDEX "CreativeHubCheckpoint_threadId_createdAt_idx"
ON "CreativeHubCheckpoint"("threadId", "createdAt");
