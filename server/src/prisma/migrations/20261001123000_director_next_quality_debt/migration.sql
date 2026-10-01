CREATE TABLE "DirectorNextQualityDebt" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "chapterOrder" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectorNextQualityDebt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DirectorNextQualityDebt_novelId_chapterOrder_createdAt_idx" ON "DirectorNextQualityDebt"("novelId", "chapterOrder", "createdAt");
CREATE INDEX "DirectorNextQualityDebt_runId_createdAt_idx" ON "DirectorNextQualityDebt"("runId", "createdAt");
ALTER TABLE "DirectorNextQualityDebt" ADD CONSTRAINT "DirectorNextQualityDebt_runId_fkey" FOREIGN KEY ("runId") REFERENCES "DirectorNextRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
