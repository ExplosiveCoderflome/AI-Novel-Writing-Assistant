CREATE TABLE "DramaBatchJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "episodeId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DramaBatchJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DramaBatchJob_projectId_createdAt_idx" ON "DramaBatchJob"("projectId", "createdAt");
CREATE INDEX "DramaBatchJob_episodeId_status_idx" ON "DramaBatchJob"("episodeId", "status");
CREATE INDEX "DramaBatchJob_type_status_idx" ON "DramaBatchJob"("type", "status");

ALTER TABLE "DramaBatchJob" ADD CONSTRAINT "DramaBatchJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DramaProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DramaBatchJob" ADD CONSTRAINT "DramaBatchJob_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "DramaEpisode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
