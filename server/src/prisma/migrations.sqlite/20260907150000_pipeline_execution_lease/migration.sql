ALTER TABLE "GenerationJob" ADD COLUMN "executionOwner" TEXT;
ALTER TABLE "GenerationJob" ADD COLUMN "executionLeaseExpiresAt" DATETIME;

CREATE INDEX "GenerationJob_status_executionLeaseExpiresAt_idx"
  ON "GenerationJob"("status", "executionLeaseExpiresAt");
