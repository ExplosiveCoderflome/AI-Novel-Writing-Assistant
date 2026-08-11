-- Additive runtime tables for multi-novel background director execution.

CREATE TABLE "DirectorRuntimeInstance" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT,
  "workflowTaskId" TEXT,
  "runId" TEXT,
  "runMode" TEXT,
  "status" TEXT NOT NULL DEFAULT 'waiting_worker',
  "currentStep" TEXT,
  "currentChapterId" TEXT,
  "checkpointVersion" INTEGER NOT NULL DEFAULT 0,
  "cancelRequestedAt" DATETIME,
  "lastHeartbeatAt" DATETIME,
  "lastErrorClass" TEXT,
  "lastErrorMessage" TEXT,
  "workerMessage" TEXT,
  "metadataJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "DirectorRuntimeInstance_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DirectorRuntimeInstance_workflowTaskId_fkey" FOREIGN KEY ("workflowTaskId") REFERENCES "NovelWorkflowTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DirectorRuntimeInstance_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DirectorRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "DirectorRuntimeCommand" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runtimeId" TEXT NOT NULL,
  "workflowTaskId" TEXT,
  "novelId" TEXT,
  "legacyCommandId" TEXT,
  "commandType" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "priority" INTEGER NOT NULL DEFAULT 50,
  "runAfter" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" TEXT,
  "leaseExpiresAt" DATETIME,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "payloadJson" TEXT,
  "errorMessage" TEXT,
  "startedAt" DATETIME,
  "finishedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "DirectorRuntimeCommand_runtimeId_fkey" FOREIGN KEY ("runtimeId") REFERENCES "DirectorRuntimeInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DirectorRuntimeCommand_workflowTaskId_fkey" FOREIGN KEY ("workflowTaskId") REFERENCES "NovelWorkflowTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DirectorRuntimeCommand_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "DirectorRuntimeExecution" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runtimeId" TEXT NOT NULL,
  "commandId" TEXT,
  "workflowTaskId" TEXT,
  "novelId" TEXT,
  "legacyCommandId" TEXT,
  "activeLockKey" TEXT,
  "workerId" TEXT,
  "slotId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'leased',
  "stepType" TEXT NOT NULL,
  "resourceClass" TEXT,
  "leaseExpiresAt" DATETIME,
  "heartbeatAt" DATETIME,
  "startedAt" DATETIME,
  "finishedAt" DATETIME,
  "errorClass" TEXT,
  "errorMessage" TEXT,
  "inputHash" TEXT,
  "checkpointVersion" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "DirectorRuntimeExecution_runtimeId_fkey" FOREIGN KEY ("runtimeId") REFERENCES "DirectorRuntimeInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DirectorRuntimeExecution_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "DirectorRuntimeCommand" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DirectorRuntimeExecution_workflowTaskId_fkey" FOREIGN KEY ("workflowTaskId") REFERENCES "NovelWorkflowTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DirectorRuntimeExecution_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "DirectorRuntimeCheckpoint" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runtimeId" TEXT NOT NULL,
  "commandId" TEXT,
  "executionId" TEXT,
  "version" INTEGER NOT NULL,
  "stepType" TEXT NOT NULL,
  "targetType" TEXT,
  "targetId" TEXT,
  "inputHash" TEXT,
  "outputRefJson" TEXT,
  "stateJson" TEXT,
  "summary" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DirectorRuntimeCheckpoint_runtimeId_fkey" FOREIGN KEY ("runtimeId") REFERENCES "DirectorRuntimeInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DirectorRuntimeCheckpoint_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "DirectorRuntimeCommand" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DirectorRuntimeCheckpoint_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "DirectorRuntimeExecution" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "DirectorRuntimeEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "runtimeId" TEXT NOT NULL,
  "commandId" TEXT,
  "executionId" TEXT,
  "workflowTaskId" TEXT,
  "novelId" TEXT,
  "type" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "severity" TEXT,
  "metadataJson" TEXT,
  "occurredAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DirectorRuntimeEvent_runtimeId_fkey" FOREIGN KEY ("runtimeId") REFERENCES "DirectorRuntimeInstance" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DirectorRuntimeEvent_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "DirectorRuntimeCommand" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DirectorRuntimeEvent_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "DirectorRuntimeExecution" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "DirectorRuntimeEvent_workflowTaskId_fkey" FOREIGN KEY ("workflowTaskId") REFERENCES "NovelWorkflowTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DirectorRuntimeEvent_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DirectorRuntimeCommand_legacyCommandId_key" ON "DirectorRuntimeCommand"("legacyCommandId");
CREATE UNIQUE INDEX "DirectorRuntimeCommand_runtimeId_commandType_idempotencyKey_key" ON "DirectorRuntimeCommand"("runtimeId", "commandType", "idempotencyKey");
CREATE UNIQUE INDEX "DirectorRuntimeExecution_activeLockKey_key" ON "DirectorRuntimeExecution"("activeLockKey");
CREATE UNIQUE INDEX "DirectorRuntimeCheckpoint_runtimeId_version_key" ON "DirectorRuntimeCheckpoint"("runtimeId", "version");
CREATE INDEX "DirectorRuntimeInstance_novelId_status_updatedAt_idx" ON "DirectorRuntimeInstance"("novelId", "status", "updatedAt");
CREATE INDEX "DirectorRuntimeInstance_workflowTaskId_idx" ON "DirectorRuntimeInstance"("workflowTaskId");
CREATE INDEX "DirectorRuntimeInstance_runId_idx" ON "DirectorRuntimeInstance"("runId");
CREATE INDEX "DirectorRuntimeInstance_status_updatedAt_idx" ON "DirectorRuntimeInstance"("status", "updatedAt");
CREATE INDEX "DirectorRuntimeCommand_runtimeId_status_updatedAt_idx" ON "DirectorRuntimeCommand"("runtimeId", "status", "updatedAt");
CREATE INDEX "DirectorRuntimeCommand_status_priority_runAfter_createdAt_idx" ON "DirectorRuntimeCommand"("status", "priority", "runAfter", "createdAt");
CREATE INDEX "DirectorRuntimeCommand_workflowTaskId_status_updatedAt_idx" ON "DirectorRuntimeCommand"("workflowTaskId", "status", "updatedAt");
CREATE INDEX "DirectorRuntimeCommand_novelId_status_updatedAt_idx" ON "DirectorRuntimeCommand"("novelId", "status", "updatedAt");
CREATE INDEX "DirectorRuntimeCommand_leaseOwner_leaseExpiresAt_idx" ON "DirectorRuntimeCommand"("leaseOwner", "leaseExpiresAt");
CREATE INDEX "DirectorRuntimeExecution_runtimeId_status_updatedAt_idx" ON "DirectorRuntimeExecution"("runtimeId", "status", "updatedAt");
CREATE INDEX "DirectorRuntimeExecution_status_leaseExpiresAt_idx" ON "DirectorRuntimeExecution"("status", "leaseExpiresAt");
CREATE INDEX "DirectorRuntimeExecution_workflowTaskId_status_updatedAt_idx" ON "DirectorRuntimeExecution"("workflowTaskId", "status", "updatedAt");
CREATE INDEX "DirectorRuntimeExecution_novelId_status_updatedAt_idx" ON "DirectorRuntimeExecution"("novelId", "status", "updatedAt");
CREATE INDEX "DirectorRuntimeExecution_workerId_status_updatedAt_idx" ON "DirectorRuntimeExecution"("workerId", "status", "updatedAt");
CREATE INDEX "DirectorRuntimeCheckpoint_runtimeId_createdAt_idx" ON "DirectorRuntimeCheckpoint"("runtimeId", "createdAt");
CREATE INDEX "DirectorRuntimeCheckpoint_commandId_idx" ON "DirectorRuntimeCheckpoint"("commandId");
CREATE INDEX "DirectorRuntimeCheckpoint_executionId_idx" ON "DirectorRuntimeCheckpoint"("executionId");
CREATE INDEX "DirectorRuntimeEvent_runtimeId_occurredAt_idx" ON "DirectorRuntimeEvent"("runtimeId", "occurredAt");
CREATE INDEX "DirectorRuntimeEvent_commandId_occurredAt_idx" ON "DirectorRuntimeEvent"("commandId", "occurredAt");
CREATE INDEX "DirectorRuntimeEvent_executionId_occurredAt_idx" ON "DirectorRuntimeEvent"("executionId", "occurredAt");
CREATE INDEX "DirectorRuntimeEvent_workflowTaskId_occurredAt_idx" ON "DirectorRuntimeEvent"("workflowTaskId", "occurredAt");
CREATE INDEX "DirectorRuntimeEvent_novelId_occurredAt_idx" ON "DirectorRuntimeEvent"("novelId", "occurredAt");
CREATE INDEX "DirectorRuntimeEvent_type_occurredAt_idx" ON "DirectorRuntimeEvent"("type", "occurredAt");
