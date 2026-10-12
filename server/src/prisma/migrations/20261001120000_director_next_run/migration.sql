CREATE TABLE "DirectorNextRun" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "driver" TEXT NOT NULL,
    "planVersion" TEXT NOT NULL,
    "contractJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectorNextRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DirectorNextRun_novelId_createdAt_idx" ON "DirectorNextRun"("novelId", "createdAt");
