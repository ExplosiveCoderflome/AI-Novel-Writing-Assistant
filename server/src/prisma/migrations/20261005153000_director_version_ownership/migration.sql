ALTER TABLE "Novel" ADD COLUMN "directorVersion" TEXT;
ALTER TABLE "Novel" ADD COLUMN "directorEpoch" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NovelWorkflowTask" ADD COLUMN "directorVersion" TEXT;
ALTER TABLE "NovelWorkflowTask" ADD COLUMN "directorEpoch" INTEGER;
