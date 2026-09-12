ALTER TABLE "GenerationJob"
  ADD COLUMN "executionOwner" TEXT,
  ADD COLUMN "executionLeaseExpiresAt" TIMESTAMP(3);

CREATE INDEX "GenerationJob_status_executionLeaseExpiresAt_idx"
  ON "GenerationJob"("status", "executionLeaseExpiresAt");
