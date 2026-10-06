CREATE TABLE "MarketSavedTopic" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reportId" TEXT NOT NULL,
  "signalId" TEXT NOT NULL DEFAULT '',
  "kind" TEXT NOT NULL DEFAULT 'genre',
  "label" TEXT NOT NULL DEFAULT '',
  "summary" TEXT NOT NULL DEFAULT '',
  "direction" TEXT NOT NULL DEFAULT 'current',
  "heat" INTEGER NOT NULL DEFAULT 0,
  "crowding" INTEGER NOT NULL DEFAULT 0,
  "name" TEXT,
  "reason" TEXT,
  "existingId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketSavedTopic_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "MarketTrendReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MarketSavedTopic_reportId_signalId_key" ON "MarketSavedTopic"("reportId", "signalId");
CREATE INDEX "MarketSavedTopic_createdAt_idx" ON "MarketSavedTopic"("createdAt");
