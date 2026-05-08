-- Additive table for user-managed prompt addendums.

CREATE TABLE "PromptAddendum" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scope" TEXT NOT NULL,
  "novelId" TEXT,
  "promptId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PromptAddendum_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PromptAddendum_scope_promptId_enabled_idx" ON "PromptAddendum"("scope", "promptId", "enabled");
CREATE INDEX "PromptAddendum_novelId_promptId_enabled_idx" ON "PromptAddendum"("novelId", "promptId", "enabled");
CREATE INDEX "PromptAddendum_updatedAt_idx" ON "PromptAddendum"("updatedAt");
