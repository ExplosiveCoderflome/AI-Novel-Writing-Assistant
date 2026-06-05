CREATE TABLE "WorldAsset" (
    "id" TEXT NOT NULL,
    "worldId" TEXT,
    "novelWorldId" TEXT,
    "assetType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "generationPrompt" TEXT,
    "renderDataJson" TEXT,
    "thumbnailUrl" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'placeholder',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorldAsset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorldAsset_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorldAsset_novelWorldId_fkey" FOREIGN KEY ("novelWorldId") REFERENCES "NovelWorld" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "WorldAsset_worldId_assetType_idx" ON "WorldAsset"("worldId", "assetType");
CREATE INDEX "WorldAsset_novelWorldId_assetType_idx" ON "WorldAsset"("novelWorldId", "assetType");
CREATE INDEX "WorldAsset_assetType_idx" ON "WorldAsset"("assetType");
