ALTER TABLE "Novel" ADD COLUMN "writingPlatform" TEXT;
ALTER TABLE "Novel" ADD COLUMN "writingPlatformProfileVersion" INTEGER;
ALTER TABLE "Novel" ADD COLUMN "writingPlatformSnapshotJson" TEXT;
CREATE INDEX "Novel_writingPlatform_idx" ON "Novel"("writingPlatform");

CREATE TABLE "WritingPlatformProfileOverride" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "platform" TEXT NOT NULL,
  "activeVersionId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "WritingPlatformProfileOverride_platform_key" ON "WritingPlatformProfileOverride"("platform");
CREATE INDEX "WritingPlatformProfileOverride_activeVersionId_idx" ON "WritingPlatformProfileOverride"("activeVersionId");

CREATE TABLE "WritingPlatformProfileVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "overrideId" TEXT NOT NULL,
  "versionNo" INTEGER NOT NULL,
  "profileJson" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WritingPlatformProfileVersion_overrideId_fkey" FOREIGN KEY ("overrideId") REFERENCES "WritingPlatformProfileOverride"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WritingPlatformProfileVersion_overrideId_versionNo_key" ON "WritingPlatformProfileVersion"("overrideId", "versionNo");
CREATE INDEX "WritingPlatformProfileVersion_overrideId_createdAt_idx" ON "WritingPlatformProfileVersion"("overrideId", "createdAt");
