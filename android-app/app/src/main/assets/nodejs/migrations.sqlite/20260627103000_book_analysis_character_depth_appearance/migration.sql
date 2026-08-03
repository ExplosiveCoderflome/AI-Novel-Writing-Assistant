ALTER TABLE "BookAnalysisCharacter" ADD COLUMN "depthMetadataJson" TEXT;
ALTER TABLE "BookAnalysisCharacter" ADD COLUMN "profileSectionsJson" TEXT;

CREATE TABLE "BookAnalysisCharacterAppearance" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "characterId" TEXT NOT NULL,
  "coveragePercent" INTEGER NOT NULL DEFAULT 0,
  "consolidatedAppearanceJson" TEXT,
  "variantPolicyJson" TEXT,
  "lastIndexedChapterIndex" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookAnalysisCharacterAppearance_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "BookAnalysisCharacter" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BookAnalysisCharacterAppearanceSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "appearanceId" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "chapterIndex" INTEGER NOT NULL,
  "chapterTitle" TEXT,
  "appearanceJson" TEXT,
  "evidenceJson" TEXT,
  "summaryCaption" TEXT,
  "contextSceneRefsJson" TEXT,
  "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookAnalysisCharacterAppearanceSnapshot_appearanceId_fkey"
    FOREIGN KEY ("appearanceId") REFERENCES "BookAnalysisCharacterAppearance" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BookAnalysisCharacterAppearanceSnapshot_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "BookAnalysisCharacter" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BookAnalysisCharacterAppearanceImage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "snapshotId" TEXT NOT NULL,
  "generationTaskId" TEXT,
  "imageAssetId" TEXT,
  "imagePromptJson" TEXT,
  "referenceAssetIdsJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookAnalysisCharacterAppearanceImage_snapshotId_fkey"
    FOREIGN KEY ("snapshotId") REFERENCES "BookAnalysisCharacterAppearanceSnapshot" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BookAnalysisCharacterAppearanceImage_generationTaskId_fkey"
    FOREIGN KEY ("generationTaskId") REFERENCES "ImageGenerationTask" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BookAnalysisCharacterAppearanceImage_imageAssetId_fkey"
    FOREIGN KEY ("imageAssetId") REFERENCES "ImageAsset" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BookAnalysisCharacterAppearance_characterId_key"
  ON "BookAnalysisCharacterAppearance"("characterId");
CREATE INDEX "BookAnalysisCharacterAppearance_coveragePercent_idx"
  ON "BookAnalysisCharacterAppearance"("coveragePercent");
CREATE UNIQUE INDEX "BookAnalysisCharacterAppearanceSnapshot_characterId_chapterIndex_key"
  ON "BookAnalysisCharacterAppearanceSnapshot"("characterId", "chapterIndex");
CREATE INDEX "BookAnalysisCharacterAppearanceSnapshot_appearanceId_chapterIndex_idx"
  ON "BookAnalysisCharacterAppearanceSnapshot"("appearanceId", "chapterIndex");
CREATE INDEX "BookAnalysisCharacterAppearanceSnapshot_characterId_chapterIndex_idx"
  ON "BookAnalysisCharacterAppearanceSnapshot"("characterId", "chapterIndex");
CREATE INDEX "BookAnalysisCharacterAppearanceSnapshot_chapterIndex_idx"
  ON "BookAnalysisCharacterAppearanceSnapshot"("chapterIndex");
CREATE UNIQUE INDEX "BookAnalysisCharacterAppearanceImage_imageAssetId_key"
  ON "BookAnalysisCharacterAppearanceImage"("imageAssetId");
CREATE INDEX "BookAnalysisCharacterAppearanceImage_generationTaskId_idx"
  ON "BookAnalysisCharacterAppearanceImage"("generationTaskId");
CREATE INDEX "BookAnalysisCharacterAppearanceImage_snapshotId_idx"
  ON "BookAnalysisCharacterAppearanceImage"("snapshotId");
