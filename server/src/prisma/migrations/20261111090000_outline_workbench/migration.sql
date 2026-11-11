CREATE TABLE "OutlineProject" (
  "id" TEXT NOT NULL, "title" TEXT NOT NULL, "summary" TEXT, "status" TEXT NOT NULL DEFAULT 'active',
  "currentVersion" INTEGER NOT NULL DEFAULT 0, "currentRevisionId" TEXT, "boundNovelId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutlineProject_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OutlineRevision" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "version" INTEGER NOT NULL, "parentRevisionId" TEXT,
  "documentJson" TEXT NOT NULL, "sourceType" TEXT NOT NULL, "sourceProposalId" TEXT, "diffSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "OutlineRevision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OutlineRevision_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "OutlineProject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "OutlineProposal" (
  "id" TEXT NOT NULL, "projectId" TEXT NOT NULL, "baseVersion" INTEGER NOT NULL, "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL, "requestText" TEXT, "proposalJson" TEXT NOT NULL, "sourceText" TEXT,
  "promptId" TEXT, "promptVersion" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "OutlineProposal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OutlineProposal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "OutlineProject"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OutlineRevision_projectId_version_key" ON "OutlineRevision"("projectId", "version");
CREATE INDEX "OutlineProject_updatedAt_idx" ON "OutlineProject"("updatedAt");
CREATE INDEX "OutlineRevision_projectId_createdAt_idx" ON "OutlineRevision"("projectId", "createdAt");
CREATE INDEX "OutlineProposal_projectId_status_createdAt_idx" ON "OutlineProposal"("projectId", "status", "createdAt");
CREATE INDEX "OutlineProposal_projectId_baseVersion_idx" ON "OutlineProposal"("projectId", "baseVersion");
