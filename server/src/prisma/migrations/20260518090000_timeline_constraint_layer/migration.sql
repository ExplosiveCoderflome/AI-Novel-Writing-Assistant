CREATE TABLE "StoryTimelineEvent" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "chapterId" TEXT,
  "chapterIndex" INTEGER,
  "eventOrder" INTEGER NOT NULL,
  "storyDayIndex" INTEGER,
  "storyTimeLabel" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "visibility" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "participantIdsJson" TEXT NOT NULL DEFAULT '[]',
  "locationId" TEXT,
  "factionIdsJson" TEXT NOT NULL DEFAULT '[]',
  "prerequisiteIdsJson" TEXT NOT NULL DEFAULT '[]',
  "consequenceIdsJson" TEXT NOT NULL DEFAULT '[]',
  "stateChangesJson" TEXT NOT NULL DEFAULT '[]',
  "eventKey" TEXT,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StoryTimelineEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChapterTimeAnchor" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "chapterId" TEXT NOT NULL,
  "chapterIndex" INTEGER NOT NULL,
  "storyDayIndex" INTEGER,
  "timeLabel" TEXT NOT NULL,
  "startsAfterIdsJson" TEXT NOT NULL DEFAULT '[]',
  "plannedEventIdsJson" TEXT NOT NULL DEFAULT '[]',
  "endedWithIdsJson" TEXT NOT NULL DEFAULT '[]',
  "previousHookIdsJson" TEXT NOT NULL DEFAULT '[]',
  "nextHookIdsJson" TEXT NOT NULL DEFAULT '[]',
  "forbiddenEventIdsJson" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChapterTimeAnchor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TimelineHook" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "createdInChapterId" TEXT NOT NULL,
  "createdInChapterIndex" INTEGER NOT NULL,
  "expectedResolveByChapterIndex" INTEGER,
  "resolvedInChapterId" TEXT,
  "resolvedInChapterIndex" INTEGER,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "priority" TEXT NOT NULL,
  "relatedEventIdsJson" TEXT NOT NULL DEFAULT '[]',
  "participantIdsJson" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TimelineHook_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TimelineConstraint" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "chapterId" TEXT,
  "chapterIndex" INTEGER,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "relatedEventIdsJson" TEXT NOT NULL DEFAULT '[]',
  "relatedHookIdsJson" TEXT NOT NULL DEFAULT '[]',
  "relatedCharacterIdsJson" TEXT NOT NULL DEFAULT '[]',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TimelineConstraint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TimelineCheckReport" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "chapterId" TEXT NOT NULL,
  "chapterIndex" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "issuesJson" TEXT NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimelineCheckReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoryTimelineEvent_novelId_chapterIndex_idx" ON "StoryTimelineEvent"("novelId", "chapterIndex");
CREATE INDEX "StoryTimelineEvent_novelId_eventOrder_idx" ON "StoryTimelineEvent"("novelId", "eventOrder");
CREATE INDEX "StoryTimelineEvent_novelId_status_idx" ON "StoryTimelineEvent"("novelId", "status");
CREATE INDEX "StoryTimelineEvent_novelId_eventKey_idx" ON "StoryTimelineEvent"("novelId", "eventKey");

CREATE UNIQUE INDEX "ChapterTimeAnchor_novelId_chapterId_key" ON "ChapterTimeAnchor"("novelId", "chapterId");
CREATE INDEX "ChapterTimeAnchor_novelId_chapterIndex_idx" ON "ChapterTimeAnchor"("novelId", "chapterIndex");

CREATE INDEX "TimelineHook_novelId_status_idx" ON "TimelineHook"("novelId", "status");
CREATE INDEX "TimelineHook_novelId_createdInChapterIndex_idx" ON "TimelineHook"("novelId", "createdInChapterIndex");
CREATE INDEX "TimelineHook_novelId_expectedResolveByChapterIndex_idx" ON "TimelineHook"("novelId", "expectedResolveByChapterIndex");

CREATE INDEX "TimelineConstraint_novelId_chapterIndex_idx" ON "TimelineConstraint"("novelId", "chapterIndex");
CREATE INDEX "TimelineConstraint_novelId_active_idx" ON "TimelineConstraint"("novelId", "active");

CREATE INDEX "TimelineCheckReport_novelId_chapterIndex_idx" ON "TimelineCheckReport"("novelId", "chapterIndex");
CREATE INDEX "TimelineCheckReport_novelId_status_idx" ON "TimelineCheckReport"("novelId", "status");
