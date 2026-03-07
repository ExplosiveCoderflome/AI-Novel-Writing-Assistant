-- CreateTable
CREATE TABLE "ImageGenerationTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneType" TEXT NOT NULL DEFAULT 'character',
    "baseCharacterId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT,
    "stylePreset" TEXT,
    "size" TEXT NOT NULL DEFAULT '1024x1024',
    "imageCount" INTEGER NOT NULL DEFAULT 1,
    "seed" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" REAL NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "error" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImageGenerationTask_baseCharacterId_fkey" FOREIGN KEY ("baseCharacterId") REFERENCES "BaseCharacter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImageAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "sceneType" TEXT NOT NULL DEFAULT 'character',
    "baseCharacterId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "seed" INTEGER,
    "prompt" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImageAsset_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ImageGenerationTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImageAsset_baseCharacterId_fkey" FOREIGN KEY ("baseCharacterId") REFERENCES "BaseCharacter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ImageGenerationTask_sceneType_status_idx" ON "ImageGenerationTask"("sceneType", "status");

-- CreateIndex
CREATE INDEX "ImageGenerationTask_baseCharacterId_createdAt_idx" ON "ImageGenerationTask"("baseCharacterId", "createdAt");

-- CreateIndex
CREATE INDEX "ImageAsset_taskId_idx" ON "ImageAsset"("taskId");

-- CreateIndex
CREATE INDEX "ImageAsset_sceneType_createdAt_idx" ON "ImageAsset"("sceneType", "createdAt");

-- CreateIndex
CREATE INDEX "ImageAsset_baseCharacterId_isPrimary_createdAt_idx" ON "ImageAsset"("baseCharacterId", "isPrimary", "createdAt");

