CREATE TABLE "MarketScanRun" (
  "id" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'queued', "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "requestedPlatformsJson" TEXT NOT NULL, "provider" TEXT, "model" TEXT, "lastError" TEXT,
  "startedAt" TIMESTAMP(3), "finishedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "MarketScanRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MarketRankingSnapshot" (
  "id" TEXT NOT NULL, "runId" TEXT NOT NULL, "platform" TEXT NOT NULL, "listKey" TEXT NOT NULL,
  "listLabel" TEXT NOT NULL, "channel" TEXT NOT NULL, "sourceUrl" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'succeeded',
  "error" TEXT, "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketRankingSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MarketRankingItem" (
  "id" TEXT NOT NULL, "snapshotId" TEXT NOT NULL, "rank" INTEGER NOT NULL, "title" TEXT NOT NULL,
  "author" TEXT, "category" TEXT, "tagsJson" TEXT, "synopsis" TEXT, "heatLabel" TEXT, "serialStatus" TEXT,
  "sourceUrl" TEXT NOT NULL, CONSTRAINT "MarketRankingItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MarketTrendReport" (
  "id" TEXT NOT NULL, "runId" TEXT NOT NULL, "summary" TEXT NOT NULL, "structuredDataJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MarketTrendReport_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MarketCreativeBrief" (
  "id" TEXT NOT NULL, "reportId" TEXT NOT NULL, "influenceMode" TEXT NOT NULL, "selectedSignalsJson" TEXT NOT NULL,
  "summary" TEXT NOT NULL, "promptBlock" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketCreativeBrief_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MarketScanRun_status_createdAt_idx" ON "MarketScanRun"("status", "createdAt");
CREATE INDEX "MarketScanRun_createdAt_idx" ON "MarketScanRun"("createdAt");
CREATE INDEX "MarketRankingSnapshot_runId_platform_idx" ON "MarketRankingSnapshot"("runId", "platform");
CREATE INDEX "MarketRankingSnapshot_platform_listKey_capturedAt_idx" ON "MarketRankingSnapshot"("platform", "listKey", "capturedAt");
CREATE INDEX "MarketRankingItem_snapshotId_rank_idx" ON "MarketRankingItem"("snapshotId", "rank");
CREATE INDEX "MarketRankingItem_title_author_idx" ON "MarketRankingItem"("title", "author");
CREATE UNIQUE INDEX "MarketTrendReport_runId_key" ON "MarketTrendReport"("runId");
CREATE INDEX "MarketTrendReport_createdAt_idx" ON "MarketTrendReport"("createdAt");
CREATE INDEX "MarketCreativeBrief_reportId_createdAt_idx" ON "MarketCreativeBrief"("reportId", "createdAt");
ALTER TABLE "MarketRankingSnapshot" ADD CONSTRAINT "MarketRankingSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MarketScanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketRankingItem" ADD CONSTRAINT "MarketRankingItem_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "MarketRankingSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketTrendReport" ADD CONSTRAINT "MarketTrendReport_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MarketScanRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketCreativeBrief" ADD CONSTRAINT "MarketCreativeBrief_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "MarketTrendReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
