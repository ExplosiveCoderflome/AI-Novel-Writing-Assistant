-- CreateTable: one isolated run per caller job and chapter; no existing data changes.
CREATE TABLE "ProductionUnitRun" (
    "id" TEXT NOT NULL,
    "ownerKey" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "profileSnapshotJson" TEXT NOT NULL,
    "policySnapshotJson" TEXT NOT NULL,
    "modelSnapshotJson" TEXT NOT NULL,
    "progressJson" TEXT NOT NULL,
    "stageArtifactsJson" TEXT NOT NULL,
    "activeStage" TEXT,
    "activeRequestKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductionUnitRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductionUnitRun_ownerKey_chapterId_key" ON "ProductionUnitRun"("ownerKey", "chapterId");
CREATE INDEX "ProductionUnitRun_novelId_chapterId_idx" ON "ProductionUnitRun"("novelId", "chapterId");
ALTER TABLE "ProductionUnitRun" ADD CONSTRAINT "ProductionUnitRun_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductionUnitRun" ADD CONSTRAINT "ProductionUnitRun_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
