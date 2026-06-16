CREATE TABLE IF NOT EXISTS "DramaBatchJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "episodeId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DramaBatchJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DramaProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DramaBatchJob_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "DramaEpisode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DramaBatchJob_projectId_createdAt_idx" ON "DramaBatchJob"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "DramaBatchJob_episodeId_status_idx" ON "DramaBatchJob"("episodeId", "status");
CREATE INDEX IF NOT EXISTS "DramaBatchJob_type_status_idx" ON "DramaBatchJob"("type", "status");
