ALTER TABLE "LlmInvocationUsageRecord" ADD COLUMN "budgetTraceJson" TEXT;
ALTER TABLE "LlmInvocationUsageRecord" ADD COLUMN "finishReason" TEXT;
ALTER TABLE "LlmInvocationUsageRecord" ADD COLUMN "structureStatus" TEXT;
