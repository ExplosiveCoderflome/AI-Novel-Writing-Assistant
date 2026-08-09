CREATE TABLE "CreationStudioConfirmation" (
  "id" TEXT NOT NULL,
  "workflowTaskId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "narrativeForm" "NarrativeForm" NOT NULL,
  "novelId" TEXT,
  "productionTaskId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'claimed',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreationStudioConfirmation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreationStudioConfirmation_workflowTaskId_key" ON "CreationStudioConfirmation"("workflowTaskId");
CREATE UNIQUE INDEX "CreationStudioConfirmation_workflowTaskId_idempotencyKey_key" ON "CreationStudioConfirmation"("workflowTaskId", "idempotencyKey");
CREATE INDEX "CreationStudioConfirmation_novelId_idx" ON "CreationStudioConfirmation"("novelId");
CREATE INDEX "CreationStudioConfirmation_productionTaskId_idx" ON "CreationStudioConfirmation"("productionTaskId");

ALTER TABLE "CreationStudioConfirmation" ADD CONSTRAINT "CreationStudioConfirmation_workflowTaskId_fkey" FOREIGN KEY ("workflowTaskId") REFERENCES "NovelWorkflowTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreationStudioConfirmation" ADD CONSTRAINT "CreationStudioConfirmation_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
