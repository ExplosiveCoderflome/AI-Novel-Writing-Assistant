CREATE TABLE "DirectorRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "novelId" TEXT,
    "entrypoint" TEXT,
    "policyJson" TEXT NOT NULL,
    "lastWorkspaceAnalysisJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DirectorRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "NovelWorkflowTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DirectorRun_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "DirectorStepRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "novelId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    "error" TEXT,
    "producedArtifactsJson" TEXT,
    "policyDecisionJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DirectorStepRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DirectorRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DirectorStepRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "NovelWorkflowTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DirectorEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT,
    "taskId" TEXT,
    "novelId" TEXT,
    "type" TEXT NOT NULL,
    "nodeKey" TEXT,
    "artifactId" TEXT,
    "artifactType" TEXT,
    "summary" TEXT NOT NULL,
    "affectedScope" TEXT,
    "severity" TEXT,
    "metadataJson" TEXT,
    "occurredAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectorEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DirectorRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DirectorEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "NovelWorkflowTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DirectorEvent_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "DirectorArtifact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT,
    "novelId" TEXT NOT NULL,
    "taskId" TEXT,
    "artifactType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "contentTable" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "contentHash" TEXT,
    "schemaVersion" TEXT NOT NULL,
    "promptAssetKey" TEXT,
    "promptVersion" TEXT,
    "modelRoute" TEXT,
    "sourceStepRunId" TEXT,
    "protectedUserContent" BOOLEAN,
    "artifactUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DirectorArtifact_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DirectorRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DirectorArtifact_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "NovelWorkflowTask" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DirectorArtifact_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DirectorArtifactDependency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artifactId" TEXT NOT NULL,
    "dependsOnArtifactId" TEXT NOT NULL,
    "dependsOnVersion" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectorArtifactDependency_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "DirectorArtifact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DirectorArtifactDependency_dependsOnArtifactId_fkey" FOREIGN KEY ("dependsOnArtifactId") REFERENCES "DirectorArtifact" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DirectorRun_taskId_key" ON "DirectorRun"("taskId");
CREATE INDEX "DirectorRun_novelId_updatedAt_idx" ON "DirectorRun"("novelId", "updatedAt");
CREATE UNIQUE INDEX "DirectorStepRun_idempotencyKey_key" ON "DirectorStepRun"("idempotencyKey");
CREATE INDEX "DirectorStepRun_runId_status_updatedAt_idx" ON "DirectorStepRun"("runId", "status", "updatedAt");
CREATE INDEX "DirectorStepRun_taskId_nodeKey_idx" ON "DirectorStepRun"("taskId", "nodeKey");
CREATE INDEX "DirectorStepRun_novelId_updatedAt_idx" ON "DirectorStepRun"("novelId", "updatedAt");
CREATE INDEX "DirectorEvent_runId_occurredAt_idx" ON "DirectorEvent"("runId", "occurredAt");
CREATE INDEX "DirectorEvent_taskId_occurredAt_idx" ON "DirectorEvent"("taskId", "occurredAt");
CREATE INDEX "DirectorEvent_novelId_occurredAt_idx" ON "DirectorEvent"("novelId", "occurredAt");
CREATE INDEX "DirectorEvent_type_occurredAt_idx" ON "DirectorEvent"("type", "occurredAt");
CREATE INDEX "DirectorArtifact_novelId_artifactType_status_idx" ON "DirectorArtifact"("novelId", "artifactType", "status");
CREATE INDEX "DirectorArtifact_runId_updatedAt_idx" ON "DirectorArtifact"("runId", "updatedAt");
CREATE INDEX "DirectorArtifact_taskId_updatedAt_idx" ON "DirectorArtifact"("taskId", "updatedAt");
CREATE INDEX "DirectorArtifact_targetType_targetId_idx" ON "DirectorArtifact"("targetType", "targetId");
CREATE INDEX "DirectorArtifact_sourceStepRunId_idx" ON "DirectorArtifact"("sourceStepRunId");
CREATE UNIQUE INDEX "DirectorArtifactDependency_artifactId_dependsOnArtifactId_key" ON "DirectorArtifactDependency"("artifactId", "dependsOnArtifactId");
CREATE INDEX "DirectorArtifactDependency_dependsOnArtifactId_idx" ON "DirectorArtifactDependency"("dependsOnArtifactId");
