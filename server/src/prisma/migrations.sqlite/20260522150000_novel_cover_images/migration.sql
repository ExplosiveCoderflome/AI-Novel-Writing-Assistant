ALTER TABLE "ImageGenerationTask" ADD COLUMN "novelId" TEXT REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImageAsset" ADD COLUMN "novelId" TEXT REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ImageGenerationTask_novelId_createdAt_idx" ON "ImageGenerationTask"("novelId", "createdAt");
CREATE INDEX "ImageAsset_novelId_isPrimary_createdAt_idx" ON "ImageAsset"("novelId", "isPrimary", "createdAt");
