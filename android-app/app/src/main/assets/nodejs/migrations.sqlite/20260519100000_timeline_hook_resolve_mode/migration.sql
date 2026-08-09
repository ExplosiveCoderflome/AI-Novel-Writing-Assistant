ALTER TABLE "TimelineHook"
ADD COLUMN "resolveMode" TEXT NOT NULL DEFAULT 'long_arc';

ALTER TABLE "TimelineHook"
ADD COLUMN "blocking" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "TimelineHook_novelId_resolveMode_blocking_idx" ON "TimelineHook"("novelId", "resolveMode", "blocking");
