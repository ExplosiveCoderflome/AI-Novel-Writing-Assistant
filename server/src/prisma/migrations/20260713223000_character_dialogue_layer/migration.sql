CREATE TABLE "CharacterDialogueSession" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "sourceMindSnapshotId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CharacterDialogueSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CharacterDialogueTurn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CharacterDialogueTurn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CharacterDialogueInfluence" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sourceMindSnapshotId" TEXT,
    "summary" TEXT NOT NULL,
    "behaviorGuidance" TEXT NOT NULL,
    "emotionalGuidance" TEXT,
    "relationTension" TEXT,
    "evidenceJson" TEXT NOT NULL DEFAULT '[]',
    "confidence" DOUBLE PRECISION,
    "targetStartChapterOrder" INTEGER NOT NULL,
    "targetEndChapterOrder" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "activatedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "resolvedChapterId" TEXT,
    "resolutionEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CharacterDialogueInfluence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CharacterDialogueSession_novelId_characterId_status_updatedAt_idx" ON "CharacterDialogueSession"("novelId", "characterId", "status", "updatedAt");
CREATE INDEX "CharacterDialogueSession_sourceMindSnapshotId_idx" ON "CharacterDialogueSession"("sourceMindSnapshotId");
CREATE INDEX "CharacterDialogueTurn_sessionId_createdAt_idx" ON "CharacterDialogueTurn"("sessionId", "createdAt");
CREATE INDEX "CharacterDialogueInfluence_novelId_characterId_status_targetStartChapterOrder_targetEndChapterOrder_idx" ON "CharacterDialogueInfluence"("novelId", "characterId", "status", "targetStartChapterOrder", "targetEndChapterOrder");
CREATE INDEX "CharacterDialogueInfluence_sessionId_createdAt_idx" ON "CharacterDialogueInfluence"("sessionId", "createdAt");
CREATE INDEX "CharacterDialogueInfluence_resolvedChapterId_idx" ON "CharacterDialogueInfluence"("resolvedChapterId");

ALTER TABLE "CharacterDialogueSession" ADD CONSTRAINT "CharacterDialogueSession_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterDialogueSession" ADD CONSTRAINT "CharacterDialogueSession_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterDialogueSession" ADD CONSTRAINT "CharacterDialogueSession_sourceMindSnapshotId_fkey" FOREIGN KEY ("sourceMindSnapshotId") REFERENCES "CharacterMindSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CharacterDialogueTurn" ADD CONSTRAINT "CharacterDialogueTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CharacterDialogueSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterDialogueInfluence" ADD CONSTRAINT "CharacterDialogueInfluence_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterDialogueInfluence" ADD CONSTRAINT "CharacterDialogueInfluence_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterDialogueInfluence" ADD CONSTRAINT "CharacterDialogueInfluence_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CharacterDialogueSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterDialogueInfluence" ADD CONSTRAINT "CharacterDialogueInfluence_sourceMindSnapshotId_fkey" FOREIGN KEY ("sourceMindSnapshotId") REFERENCES "CharacterMindSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CharacterDialogueInfluence" ADD CONSTRAINT "CharacterDialogueInfluence_resolvedChapterId_fkey" FOREIGN KEY ("resolvedChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
