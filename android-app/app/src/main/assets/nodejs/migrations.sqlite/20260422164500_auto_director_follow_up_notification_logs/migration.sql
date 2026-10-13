CREATE TABLE "AutoDirectorFollowUpNotificationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "target" TEXT,
    "requestPayload" TEXT,
    "responseBody" TEXT,
    "responseStatus" INTEGER,
    "attemptCount" INTEGER NOT NULL DEFAULT 1,
    "deliveredAt" DATETIME,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "AutoDirectorFollowUpNotificationLog_taskId_createdAt_idx"
ON "AutoDirectorFollowUpNotificationLog"("taskId", "createdAt");

CREATE INDEX "AutoDirectorFollowUpNotificationLog_eventId_channelType_createdAt_idx"
ON "AutoDirectorFollowUpNotificationLog"("eventId", "channelType", "createdAt");
