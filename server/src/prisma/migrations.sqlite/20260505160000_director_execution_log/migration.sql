-- CreateTable
CREATE TABLE "DirectorExecutionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "novelId" TEXT,
    "stage" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "detail" TEXT,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "DirectorExecutionLog_taskId_createdAt_idx" ON "DirectorExecutionLog"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectorExecutionLog_novelId_createdAt_idx" ON "DirectorExecutionLog"("novelId", "createdAt");
