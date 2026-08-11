CREATE TABLE "ChapterArtifactSyncCheckpoint" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT NOT NULL,
  "chapterId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "artifactType" TEXT NOT NULL,
  "syncMode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'succeeded',
  "sourceType" TEXT,
  "sourceStage" TEXT,
  "metadataJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ChapterArtifactSyncCheckpoint_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChapterArtifactSyncCheckpoint_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ChapterArtifactSyncCheckpoint_novelId_chapterId_contentHash_artifactType_syncMode_key"
  ON "ChapterArtifactSyncCheckpoint"("novelId", "chapterId", "contentHash", "artifactType", "syncMode");

CREATE INDEX "ChapterArtifactSyncCheckpoint_novelId_chapterId_artifactType_updatedAt_idx"
  ON "ChapterArtifactSyncCheckpoint"("novelId", "chapterId", "artifactType", "updatedAt");
