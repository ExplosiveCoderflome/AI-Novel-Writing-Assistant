-- CreateTable
CREATE TABLE "TaskCenterArchive" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskKind" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "archivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskCenterArchive_taskKind_taskId_key"
ON "TaskCenterArchive"("taskKind", "taskId");

-- CreateIndex
CREATE INDEX "TaskCenterArchive_taskKind_archivedAt_idx"
ON "TaskCenterArchive"("taskKind", "archivedAt");
