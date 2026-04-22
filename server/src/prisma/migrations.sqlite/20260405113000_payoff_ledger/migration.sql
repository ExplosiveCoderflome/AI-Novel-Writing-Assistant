CREATE TABLE "PayoffLedgerItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT NOT NULL,
  "ledgerKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL,
  "currentStatus" TEXT NOT NULL,
  "targetStartChapterOrder" INTEGER,
  "targetEndChapterOrder" INTEGER,
  "firstSeenChapterOrder" INTEGER,
  "lastTouchedChapterOrder" INTEGER,
  "lastTouchedChapterId" TEXT,
  "setupChapterId" TEXT,
  "payoffChapterId" TEXT,
  "lastSnapshotId" TEXT,
  "sourceRefsJson" TEXT,
  "evidenceJson" TEXT,
  "riskSignalsJson" TEXT,
  "statusReason" TEXT,
  "confidence" REAL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PayoffLedgerItem_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PayoffLedgerItem_lastTouchedChapterId_fkey" FOREIGN KEY ("lastTouchedChapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PayoffLedgerItem_setupChapterId_fkey" FOREIGN KEY ("setupChapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PayoffLedgerItem_payoffChapterId_fkey" FOREIGN KEY ("payoffChapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "PayoffLedgerItem_lastSnapshotId_fkey" FOREIGN KEY ("lastSnapshotId") REFERENCES "StoryStateSnapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PayoffLedgerItem_novelId_ledgerKey_key" ON "PayoffLedgerItem"("novelId", "ledgerKey");
CREATE INDEX "PayoffLedgerItem_novelId_currentStatus_updatedAt_idx" ON "PayoffLedgerItem"("novelId", "currentStatus", "updatedAt");
CREATE INDEX "PayoffLedgerItem_novelId_targetEndChapterOrder_idx" ON "PayoffLedgerItem"("novelId", "targetEndChapterOrder");
CREATE INDEX "PayoffLedgerItem_lastTouchedChapterId_idx" ON "PayoffLedgerItem"("lastTouchedChapterId");
CREATE INDEX "PayoffLedgerItem_setupChapterId_idx" ON "PayoffLedgerItem"("setupChapterId");
CREATE INDEX "PayoffLedgerItem_payoffChapterId_idx" ON "PayoffLedgerItem"("payoffChapterId");
CREATE INDEX "PayoffLedgerItem_lastSnapshotId_idx" ON "PayoffLedgerItem"("lastSnapshotId");
