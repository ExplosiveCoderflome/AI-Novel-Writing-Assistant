CREATE TABLE "CharacterConversationSession" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CharacterConversationSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CharacterConversationTurn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL DEFAULT '[]',
    "uncertainty" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CharacterConversationTurn_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CharacterDialogueInfluence" ADD COLUMN "conversationSessionId" TEXT;
ALTER TABLE "CharacterDialogueInfluence" ALTER COLUMN "sessionId" DROP NOT NULL;
ALTER TABLE "CharacterDialogueInfluence" DROP CONSTRAINT "CharacterDialogueInfluence_sessionId_fkey";
ALTER TABLE "CharacterDialogueInfluence" ADD CONSTRAINT "CharacterDialogueInfluence_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CharacterDialogueSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CharacterDialogueInfluence" ADD CONSTRAINT "CharacterDialogueInfluence_conversationSessionId_fkey" FOREIGN KEY ("conversationSessionId") REFERENCES "CharacterConversationSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CharacterConversationTurn" ADD CONSTRAINT "CharacterConversationTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CharacterConversationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "CharacterConversationSession_legacyDialogueSessionId_key" ON "CharacterConversationSession"("legacyDialogueSessionId");
CREATE INDEX "CharacterConversationSession_subjectKind_subjectId_scopeKind_scopeId_status_updatedAt_idx" ON "CharacterConversationSession"("subjectKind", "subjectId", "scopeKind", "scopeId", "status", "updatedAt");
CREATE INDEX "CharacterConversationSession_scopeKind_scopeId_updatedAt_idx" ON "CharacterConversationSession"("scopeKind", "scopeId", "updatedAt");
CREATE INDEX "CharacterConversationTurn_sessionId_createdAt_idx" ON "CharacterConversationTurn"("sessionId", "createdAt");
CREATE INDEX "CharacterDialogueInfluence_conversationSessionId_createdAt_idx" ON "CharacterDialogueInfluence"("conversationSessionId", "createdAt");
