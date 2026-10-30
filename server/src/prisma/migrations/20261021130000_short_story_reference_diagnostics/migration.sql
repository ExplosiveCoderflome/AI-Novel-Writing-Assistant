-- AlterTable
ALTER TABLE "Novel" ADD COLUMN     "shortStoryReferenceJson" TEXT;

-- CreateTable
CREATE TABLE "StructuredInvocationDiagnostic" (
    "id" TEXT NOT NULL,
    "invocationId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "taskId" TEXT,
    "novelId" TEXT,
    "promptId" TEXT NOT NULL,
    "stage" TEXT,
    "kind" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "requestProtocol" TEXT,
    "strategy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "detailsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StructuredInvocationDiagnostic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StructuredInvocationDiagnostic_taskId_createdAt_idx" ON "StructuredInvocationDiagnostic"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "StructuredInvocationDiagnostic_invocationId_attempt_idx" ON "StructuredInvocationDiagnostic"("invocationId", "attempt");

-- AddForeignKey
ALTER TABLE "StructuredInvocationDiagnostic" ADD CONSTRAINT "StructuredInvocationDiagnostic_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "NovelWorkflowTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StructuredInvocationDiagnostic" ADD CONSTRAINT "StructuredInvocationDiagnostic_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
