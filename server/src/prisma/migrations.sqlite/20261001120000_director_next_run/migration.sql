CREATE TABLE "DirectorNextRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "driver" TEXT NOT NULL,
    "planVersion" TEXT NOT NULL,
    "contractJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "DirectorNextRun_novelId_createdAt_idx" ON "DirectorNextRun"("novelId", "createdAt");
