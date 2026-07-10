ALTER TABLE "BaseCharacter" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "BaseCharacter" ADD COLUMN "sourceRefId" TEXT;

ALTER TABLE "ImageGenerationTask" ADD COLUMN "bookAnalysisCharacterId" TEXT REFERENCES "BookAnalysisCharacter" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImageAsset" ADD COLUMN "bookAnalysisCharacterId" TEXT REFERENCES "BookAnalysisCharacter" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "BaseCharacter_sourceType_sourceRefId_idx" ON "BaseCharacter"("sourceType", "sourceRefId");
CREATE INDEX "ImageGenerationTask_bookAnalysisCharacterId_createdAt_idx" ON "ImageGenerationTask"("bookAnalysisCharacterId", "createdAt");
CREATE INDEX "ImageAsset_bookAnalysisCharacterId_isPrimary_createdAt_idx" ON "ImageAsset"("bookAnalysisCharacterId", "isPrimary", "createdAt");
