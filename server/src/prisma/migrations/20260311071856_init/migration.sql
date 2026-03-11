-- AlterTable
ALTER TABLE "AgentApproval" ADD COLUMN "expiresAt" DATETIME;

-- AlterTable
ALTER TABLE "AgentStep" ADD COLUMN "costUsd" REAL;
ALTER TABLE "AgentStep" ADD COLUMN "errorCode" TEXT;
ALTER TABLE "AgentStep" ADD COLUMN "model" TEXT;
ALTER TABLE "AgentStep" ADD COLUMN "parentStepId" TEXT;
ALTER TABLE "AgentStep" ADD COLUMN "provider" TEXT;
ALTER TABLE "AgentStep" ADD COLUMN "tokenUsageJson" TEXT;

-- CreateIndex
CREATE INDEX "AgentApproval_status_expiresAt_idx" ON "AgentApproval"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "AgentStep_runId_parentStepId_idx" ON "AgentStep"("runId", "parentStepId");
