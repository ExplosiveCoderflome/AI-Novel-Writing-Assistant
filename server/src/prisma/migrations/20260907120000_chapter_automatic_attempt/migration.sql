CREATE TABLE "ChapterAutomaticAttempt" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChapterAutomaticAttempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ChapterAutomaticAttempt_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChapterAutomaticAttempt_jobId_chapterId_key" ON "ChapterAutomaticAttempt"("jobId", "chapterId");
