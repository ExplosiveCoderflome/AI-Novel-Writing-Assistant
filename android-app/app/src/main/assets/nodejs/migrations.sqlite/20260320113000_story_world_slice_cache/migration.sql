ALTER TABLE "Novel" ADD COLUMN "storyWorldSliceJson" TEXT;
ALTER TABLE "Novel" ADD COLUMN "storyWorldSliceOverridesJson" TEXT;
ALTER TABLE "Novel" ADD COLUMN "storyWorldSliceSchemaVersion" INTEGER NOT NULL DEFAULT 1;
