-- ModelRouteConfig for task-type model routing
CREATE TABLE "ModelRouteConfig" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "taskType" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "temperature" REAL NOT NULL DEFAULT 0.7,
  "maxTokens" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ModelRouteConfig_taskType_key" ON "ModelRouteConfig"("taskType");

-- AgentRun.chapterId for chapter-generation traces
ALTER TABLE "AgentRun" ADD COLUMN "chapterId" TEXT;

CREATE INDEX "AgentRun_novelId_chapterId_createdAt_idx" ON "AgentRun"("novelId", "chapterId", "createdAt");
