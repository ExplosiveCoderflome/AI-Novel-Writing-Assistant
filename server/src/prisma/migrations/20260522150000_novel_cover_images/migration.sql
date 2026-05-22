ALTER TABLE "ImageGenerationTask" ADD COLUMN "novelId" TEXT;
ALTER TABLE "ImageAsset" ADD COLUMN "novelId" TEXT;

CREATE INDEX "ImageGenerationTask_novelId_createdAt_idx" ON "ImageGenerationTask"("novelId", "createdAt");
CREATE INDEX "ImageAsset_novelId_isPrimary_createdAt_idx" ON "ImageAsset"("novelId", "isPrimary", "createdAt");

ALTER TABLE "ImageGenerationTask" ADD CONSTRAINT "ImageGenerationTask_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImageAsset" ADD CONSTRAINT "ImageAsset_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
