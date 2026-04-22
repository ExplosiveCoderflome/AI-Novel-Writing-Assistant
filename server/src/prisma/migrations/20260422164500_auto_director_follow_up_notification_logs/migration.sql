CREATE TABLE "AutoDirectorFollowUpNotificationLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "target" TEXT,
    "requestPayload" TEXT,
    "responseBody" TEXT,
    "responseStatus" INTEGER,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "deliveredAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoDirectorFollowUpNotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutoDirectorFollowUpNotificationLog_taskId_createdAt_idx" ON "AutoDirectorFollowUpNotificationLog"("taskId", "createdAt");
CREATE INDEX "AutoDirectorFollowUpNotificationLog_eventId_channelType_createdAt_idx" ON "AutoDirectorFollowUpNotificationLog"("eventId", "channelType", "createdAt");
