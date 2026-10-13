CREATE TABLE "CharacterInfluenceProposal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "proposalSetId" TEXT NOT NULL,
  "sourceMindSnapshotId" TEXT,
  "title" TEXT NOT NULL,
  "directionSummary" TEXT NOT NULL,
  "recommendationReason" TEXT NOT NULL,
  "isRecommended" BOOLEAN NOT NULL DEFAULT false,
  "behaviorGuidance" TEXT NOT NULL,
  "emotionalGuidance" TEXT,
  "relationTension" TEXT,
  "readerPayoff" TEXT NOT NULL,
  "risk" TEXT NOT NULL,
  "observableSignalsJson" TEXT NOT NULL DEFAULT '[]',
  "evidenceJson" TEXT NOT NULL DEFAULT '[]',
  "confidence" REAL,
  "authorIntent" TEXT,
  "targetStartChapterOrder" INTEGER NOT NULL,
  "targetEndChapterOrder" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "acceptedAt" DATETIME,
  "appliedAt" DATETIME,
  "resolvedChapterId" TEXT,
  "resolutionEvidenceJson" TEXT NOT NULL DEFAULT '[]',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CharacterInfluenceProposal_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CharacterInfluenceProposal_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CharacterInfluenceProposal_sourceMindSnapshotId_fkey" FOREIGN KEY ("sourceMindSnapshotId") REFERENCES "CharacterMindSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CharacterInfluenceProposal_resolvedChapterId_fkey" FOREIGN KEY ("resolvedChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "CharacterInfluenceProposal_novelId_characterId_status_targetStartChapterOrder_targetEndChapterOrder_idx" ON "CharacterInfluenceProposal"("novelId", "characterId", "status", "targetStartChapterOrder", "targetEndChapterOrder");
CREATE INDEX "CharacterInfluenceProposal_proposalSetId_idx" ON "CharacterInfluenceProposal"("proposalSetId");
CREATE INDEX "CharacterInfluenceProposal_resolvedChapterId_idx" ON "CharacterInfluenceProposal"("resolvedChapterId");
