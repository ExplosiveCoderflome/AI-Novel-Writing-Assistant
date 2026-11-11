ALTER TABLE "OutlineBookBinding" ADD COLUMN "feedbackSettingsJson" TEXT NOT NULL DEFAULT '{}';
CREATE TABLE "OutlineFeedbackRun" (
  "id" TEXT NOT NULL PRIMARY KEY, "projectId" TEXT NOT NULL, "novelId" TEXT NOT NULL,
  "chapterId" TEXT NOT NULL, "chapterOrder" INTEGER NOT NULL, "requestKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending', "attempt" INTEGER NOT NULL DEFAULT 0,
  "inputJson" TEXT NOT NULL, "itemsJson" TEXT NOT NULL DEFAULT '[]', "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "OutlineFeedbackRun_requestKey_key" ON "OutlineFeedbackRun"("requestKey");
CREATE INDEX "OutlineFeedbackRun_projectId_createdAt_idx" ON "OutlineFeedbackRun"("projectId", "createdAt");
