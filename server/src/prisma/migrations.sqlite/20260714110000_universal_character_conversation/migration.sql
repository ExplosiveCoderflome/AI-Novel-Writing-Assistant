PRAGMA foreign_keys=OFF;

CREATE TABLE "CharacterConversationSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subjectKind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "scopeKind" TEXT NOT NULL,
    "scopeId" TEXT,
    "interactionPolicy" TEXT NOT NULL,
    "chapterAnchor" INTEGER,
    "sourceSnapshotJson" TEXT NOT NULL DEFAULT '{}',
    "evidenceBoundaryJson" TEXT NOT NULL DEFAULT '[]',
    "legacyDialogueSessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "CharacterConversationTurn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL DEFAULT '[]',
    "uncertainty" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CharacterConversationTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CharacterConversationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "new_CharacterDialogueInfluence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "sessionId" TEXT,
    "conversationSessionId" TEXT,
    "sourceMindSnapshotId" TEXT,
    "summary" TEXT NOT NULL,
    "behaviorGuidance" TEXT NOT NULL,
    "emotionalGuidance" TEXT,
    "relationTension" TEXT,
    "evidenceJson" TEXT NOT NULL DEFAULT '[]',
    "confidence" REAL,
    "targetStartChapterOrder" INTEGER NOT NULL,
    "targetEndChapterOrder" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "activatedAt" DATETIME,
    "appliedAt" DATETIME,
    "resolvedChapterId" TEXT,
    "resolutionEvidenceJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharacterDialogueInfluence_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterDialogueInfluence_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterDialogueInfluence_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CharacterDialogueSession"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CharacterDialogueInfluence_conversationSessionId_fkey" FOREIGN KEY ("conversationSessionId") REFERENCES "CharacterConversationSession"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CharacterDialogueInfluence_sourceMindSnapshotId_fkey" FOREIGN KEY ("sourceMindSnapshotId") REFERENCES "CharacterMindSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CharacterDialogueInfluence_resolvedChapterId_fkey" FOREIGN KEY ("resolvedChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_CharacterDialogueInfluence" ("id", "novelId", "characterId", "sessionId", "sourceMindSnapshotId", "summary", "behaviorGuidance", "emotionalGuidance", "relationTension", "evidenceJson", "confidence", "targetStartChapterOrder", "targetEndChapterOrder", "status", "activatedAt", "appliedAt", "resolvedChapterId", "resolutionEvidenceJson", "createdAt", "updatedAt")
SELECT "id", "novelId", "characterId", "sessionId", "sourceMindSnapshotId", "summary", "behaviorGuidance", "emotionalGuidance", "relationTension", "evidenceJson", "confidence", "targetStartChapterOrder", "targetEndChapterOrder", "status", "activatedAt", "appliedAt", "resolvedChapterId", "resolutionEvidenceJson", "createdAt", "updatedAt"
FROM "CharacterDialogueInfluence";

DROP TABLE "CharacterDialogueInfluence";
ALTER TABLE "new_CharacterDialogueInfluence" RENAME TO "CharacterDialogueInfluence";

CREATE UNIQUE INDEX "CharacterConversationSession_legacyDialogueSessionId_key" ON "CharacterConversationSession"("legacyDialogueSessionId");
CREATE INDEX "CharacterConversationSession_subjectKind_subjectId_scopeKind_scopeId_status_updatedAt_idx" ON "CharacterConversationSession"("subjectKind", "subjectId", "scopeKind", "scopeId", "status", "updatedAt");
CREATE INDEX "CharacterConversationSession_scopeKind_scopeId_updatedAt_idx" ON "CharacterConversationSession"("scopeKind", "scopeId", "updatedAt");
CREATE INDEX "CharacterConversationTurn_sessionId_createdAt_idx" ON "CharacterConversationTurn"("sessionId", "createdAt");
CREATE INDEX "CharacterDialogueInfluence_novelId_characterId_status_targetStartChapterOrder_targetEndChapterOrder_idx" ON "CharacterDialogueInfluence"("novelId", "characterId", "status", "targetStartChapterOrder", "targetEndChapterOrder");
CREATE INDEX "CharacterDialogueInfluence_sessionId_createdAt_idx" ON "CharacterDialogueInfluence"("sessionId", "createdAt");
CREATE INDEX "CharacterDialogueInfluence_conversationSessionId_createdAt_idx" ON "CharacterDialogueInfluence"("conversationSessionId", "createdAt");
CREATE INDEX "CharacterDialogueInfluence_resolvedChapterId_idx" ON "CharacterDialogueInfluence"("resolvedChapterId");

PRAGMA foreign_keys=ON;
