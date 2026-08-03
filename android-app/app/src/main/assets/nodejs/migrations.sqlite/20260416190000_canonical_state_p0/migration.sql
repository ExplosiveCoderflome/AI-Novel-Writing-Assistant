CREATE TABLE "CanonicalStateVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceStage" TEXT,
    "version" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "acceptedProposalIdsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CanonicalStateVersion_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CanonicalStateVersion_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "StateChangeProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "sourceSnapshotId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceStage" TEXT,
    "proposalType" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'validated',
    "summary" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "evidenceJson" TEXT,
    "validationNotesJson" TEXT,
    "committedVersionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StateChangeProposal_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StateChangeProposal_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StateChangeProposal_committedVersionId_fkey" FOREIGN KEY ("committedVersionId") REFERENCES "CanonicalStateVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CanonicalStateVersion_novelId_version_key" ON "CanonicalStateVersion"("novelId", "version");
CREATE INDEX "CanonicalStateVersion_novelId_createdAt_idx" ON "CanonicalStateVersion"("novelId", "createdAt");
CREATE INDEX "CanonicalStateVersion_chapterId_idx" ON "CanonicalStateVersion"("chapterId");
CREATE INDEX "StateChangeProposal_novelId_createdAt_idx" ON "StateChangeProposal"("novelId", "createdAt");
CREATE INDEX "StateChangeProposal_chapterId_createdAt_idx" ON "StateChangeProposal"("chapterId", "createdAt");
CREATE INDEX "StateChangeProposal_status_riskLevel_createdAt_idx" ON "StateChangeProposal"("status", "riskLevel", "createdAt");
CREATE INDEX "StateChangeProposal_committedVersionId_idx" ON "StateChangeProposal"("committedVersionId");
