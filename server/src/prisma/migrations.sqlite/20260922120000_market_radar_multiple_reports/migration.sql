DROP INDEX "MarketTrendReport_runId_key";

CREATE INDEX "MarketTrendReport_runId_createdAt_idx" ON "MarketTrendReport"("runId", "createdAt");
