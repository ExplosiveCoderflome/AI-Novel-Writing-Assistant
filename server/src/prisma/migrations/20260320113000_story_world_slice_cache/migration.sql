ALTER TABLE "Novel"
ADD COLUMN "storyWorldSliceJson" TEXT,
ADD COLUMN "storyWorldSliceOverridesJson" TEXT,
ADD COLUMN "storyWorldSliceSchemaVersion" INTEGER NOT NULL DEFAULT 1;
