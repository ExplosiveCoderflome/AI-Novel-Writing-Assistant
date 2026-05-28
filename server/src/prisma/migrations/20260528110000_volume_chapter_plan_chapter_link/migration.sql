ALTER TABLE "VolumeChapterPlan" ADD COLUMN "chapterId" TEXT;

CREATE INDEX "VolumeChapterPlan_chapterId_idx" ON "VolumeChapterPlan"("chapterId");

ALTER TABLE "VolumeChapterPlan" ADD CONSTRAINT "VolumeChapterPlan_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
