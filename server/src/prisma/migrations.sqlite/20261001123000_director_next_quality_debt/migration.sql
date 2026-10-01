CREATE TABLE "DirectorNextQualityDebt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "chapterOrder" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectorNextQualityDebt_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DirectorNextRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DirectorNextQualityDebt_novelId_chapterOrder_createdAt_idx" ON "DirectorNextQualityDebt"("novelId", "chapterOrder", "createdAt");
CREATE INDEX "DirectorNextQualityDebt_runId_createdAt_idx" ON "DirectorNextQualityDebt"("runId", "createdAt");
