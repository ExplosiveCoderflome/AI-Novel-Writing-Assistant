CREATE TABLE "OpeningCandidateProposal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "status" TEXT NOT NULL,
  "changesJson" TEXT NOT NULL,
  "appliedFieldsJson" TEXT,
  CONSTRAINT "OpeningCandidateProposal_id_fkey" FOREIGN KEY ("id")
    REFERENCES "AgentConversationTurn" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
