CREATE TABLE "CreationStudioConfirmation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workflowTaskId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "narrativeForm" TEXT NOT NULL,
  "novelId" TEXT,
  "productionTaskId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'claimed',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CreationStudioConfirmation_workflowTaskId_fkey" FOREIGN KEY ("workflowTaskId") REFERENCES "NovelWorkflowTask"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CreationStudioConfirmation_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CreationStudioConfirmation_workflowTaskId_key" ON "CreationStudioConfirmation"("workflowTaskId");
CREATE UNIQUE INDEX "CreationStudioConfirmation_workflowTaskId_idempotencyKey_key" ON "CreationStudioConfirmation"("workflowTaskId", "idempotencyKey");
CREATE INDEX "CreationStudioConfirmation_novelId_idx" ON "CreationStudioConfirmation"("novelId");
CREATE INDEX "CreationStudioConfirmation_productionTaskId_idx" ON "CreationStudioConfirmation"("productionTaskId");
