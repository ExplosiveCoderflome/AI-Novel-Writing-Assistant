CREATE TABLE "AutoDirectorAutoApprovalRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "taskId" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "approvalPointCode" TEXT NOT NULL,
  "approvalPointLabel" TEXT NOT NULL,
  "checkpointType" TEXT NOT NULL,
  "checkpointSummary" TEXT,
  "summary" TEXT NOT NULL,
  "stage" TEXT,
  "scopeLabel" TEXT,
  "eventId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutoDirectorAutoApprovalRecord_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "NovelWorkflowTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AutoDirectorAutoApprovalRecord_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AutoDirectorAutoApprovalRecord_eventId_key"
ON "AutoDirectorAutoApprovalRecord"("eventId");

CREATE INDEX "AutoDirectorAutoApprovalRecord_novelId_createdAt_idx"
ON "AutoDirectorAutoApprovalRecord"("novelId", "createdAt");

CREATE INDEX "AutoDirectorAutoApprovalRecord_taskId_createdAt_idx"
ON "AutoDirectorAutoApprovalRecord"("taskId", "createdAt");
