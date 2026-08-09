ALTER TABLE "VolumeChapterPlan" ADD COLUMN "chapterId" TEXT;

CREATE INDEX "VolumeChapterPlan_chapterId_idx" ON "VolumeChapterPlan"("chapterId");
