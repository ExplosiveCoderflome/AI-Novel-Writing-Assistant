-- Additive table for user-managed prompt addendums.

CREATE TABLE "PromptAddendum" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "novelId" TEXT,
  "promptId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PromptAddendum_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromptAddendum_scope_promptId_enabled_idx" ON "PromptAddendum"("scope", "promptId", "enabled");
CREATE INDEX "PromptAddendum_novelId_promptId_enabled_idx" ON "PromptAddendum"("novelId", "promptId", "enabled");
CREATE INDEX "PromptAddendum_updatedAt_idx" ON "PromptAddendum"("updatedAt");

ALTER TABLE "PromptAddendum" ADD CONSTRAINT "PromptAddendum_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
