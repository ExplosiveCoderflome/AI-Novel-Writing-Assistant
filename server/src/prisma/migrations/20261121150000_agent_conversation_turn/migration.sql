ALTER TABLE "OutlineProposal" ADD COLUMN "characterNodeId" TEXT;
CREATE INDEX "OutlineProposal_projectId_kind_characterNodeId_idx" ON "OutlineProposal"("projectId", "kind", "characterNodeId");

CREATE TABLE "AgentConversationTurn" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scopeKey" TEXT NOT NULL,
  "activeSlot" TEXT,
  "contextVersion" TEXT NOT NULL,
  "parentResultId" TEXT,
  "requestText" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "replyText" TEXT,
  "resultId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AgentConversationTurn_scopeKey_resultId_key" ON "AgentConversationTurn"("scopeKey", "resultId");
CREATE UNIQUE INDEX "AgentConversationTurn_scopeKey_activeSlot_key" ON "AgentConversationTurn"("scopeKey", "activeSlot");
CREATE INDEX "AgentConversationTurn_scopeKey_createdAt_idx" ON "AgentConversationTurn"("scopeKey", "createdAt");
