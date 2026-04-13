-- AlterTable
ALTER TABLE "Novel" ADD COLUMN "worldId" TEXT REFERENCES "World"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "World" ADD COLUMN "worldType" TEXT;
ALTER TABLE "World" ADD COLUMN "templateKey" TEXT;
ALTER TABLE "World" ADD COLUMN "axioms" TEXT;
ALTER TABLE "World" ADD COLUMN "history" TEXT;
ALTER TABLE "World" ADD COLUMN "economy" TEXT;
ALTER TABLE "World" ADD COLUMN "factions" TEXT;
ALTER TABLE "World" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "World" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "World" ADD COLUMN "selectedDimensions" TEXT;
ALTER TABLE "World" ADD COLUMN "selectedElements" TEXT;
ALTER TABLE "World" ADD COLUMN "layerStates" TEXT;
ALTER TABLE "World" ADD COLUMN "consistencyReport" TEXT;
ALTER TABLE "World" ADD COLUMN "overviewSummary" TEXT;

-- AlterTable
ALTER TABLE "WorldPropertyLibrary" ADD COLUMN "sourceWorldId" TEXT REFERENCES "World"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "WorldSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "label" TEXT,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorldSnapshot_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorldDeepeningQA" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'recommended',
    "question" TEXT NOT NULL,
    "targetLayer" TEXT,
    "targetField" TEXT,
    "answer" TEXT,
    "integratedSummary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorldDeepeningQA_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorldConsistencyIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" TEXT,
    "source" TEXT NOT NULL DEFAULT 'rule',
    "status" TEXT NOT NULL DEFAULT 'open',
    "targetField" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorldConsistencyIssue_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Novel_worldId_idx" ON "Novel"("worldId");

-- CreateIndex
CREATE INDEX "WorldPropertyLibrary_sourceWorldId_idx" ON "WorldPropertyLibrary"("sourceWorldId");

-- CreateIndex
CREATE INDEX "WorldSnapshot_worldId_createdAt_idx" ON "WorldSnapshot"("worldId", "createdAt");

-- CreateIndex
CREATE INDEX "WorldDeepeningQA_worldId_status_idx" ON "WorldDeepeningQA"("worldId", "status");

-- CreateIndex
CREATE INDEX "WorldConsistencyIssue_worldId_status_idx" ON "WorldConsistencyIssue"("worldId", "status");

-- CreateIndex
CREATE INDEX "WorldConsistencyIssue_worldId_severity_idx" ON "WorldConsistencyIssue"("worldId", "severity");
