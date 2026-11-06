-- Additive timing and optional compressed invocation history.
ALTER TABLE "DirectorLlmUsageRecord" ADD COLUMN "firstTokenMs" INTEGER;
ALTER TABLE "DirectorLlmUsageRecord" ADD COLUMN "attemptNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "DirectorLlmUsageRecord" ADD COLUMN "chainId" TEXT;
ALTER TABLE "DirectorLlmUsageRecord" ADD COLUMN "parentInvocationId" TEXT;
ALTER TABLE "DirectorLlmUsageRecord" ADD COLUMN "structuredMode" TEXT;
ALTER TABLE "LlmInvocationUsageRecord" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "LlmInvocationUsageRecord" ADD COLUMN "firstTokenMs" INTEGER;
ALTER TABLE "LlmInvocationUsageRecord" ADD COLUMN "attemptNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "LlmInvocationUsageRecord" ADD COLUMN "chainId" TEXT;
ALTER TABLE "LlmInvocationUsageRecord" ADD COLUMN "parentInvocationId" TEXT;
ALTER TABLE "LlmInvocationUsageRecord" ADD COLUMN "structuredMode" TEXT;
UPDATE "LlmInvocationUsageRecord" SET "durationMs" = GREATEST(0, LEAST(2147483647, ROUND(EXTRACT(EPOCH FROM ("finishedAt" - "startedAt")) * 1000)))::INTEGER;
CREATE INDEX "LlmInvocationUsageRecord_chainId_attemptNumber_idx" ON "LlmInvocationUsageRecord"("chainId", "attemptNumber");
CREATE TABLE "LlmInvocationPayload" (
  "usageRecordId" TEXT NOT NULL PRIMARY KEY,
  "compressed" BYTEA NOT NULL,
  "compressedBytes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LlmInvocationPayload_usageRecordId_fkey" FOREIGN KEY ("usageRecordId") REFERENCES "LlmInvocationUsageRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LlmInvocationPayload_createdAt_usageRecordId_idx" ON "LlmInvocationPayload"("createdAt", "usageRecordId");
