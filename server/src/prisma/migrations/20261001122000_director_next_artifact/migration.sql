CREATE TABLE "DirectorNextArtifact" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "protectedUserContent" BOOLEAN NOT NULL,
    "contentRef" TEXT NOT NULL,
    "contentHash" TEXT,
    "producedByRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectorNextArtifact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DirectorNextArtifact_novelId_type_scope_status_idx" ON "DirectorNextArtifact"("novelId", "type", "scope", "status");
CREATE UNIQUE INDEX "DirectorNextArtifact_novelId_type_scope_version_key" ON "DirectorNextArtifact"("novelId", "type", "scope", "version");
ALTER TABLE "DirectorNextArtifact" ADD CONSTRAINT "DirectorNextArtifact_producedByRunId_fkey" FOREIGN KEY ("producedByRunId") REFERENCES "DirectorNextRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
