CREATE TABLE "PromptSlotOverride" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "novelId" TEXT,
  "promptId" TEXT NOT NULL,
  "baseVersion" TEXT NOT NULL,
  "slots" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PromptSlotOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromptSlotOverride_scope_novelId_promptId_key" ON "PromptSlotOverride"("scope", "novelId", "promptId");
CREATE INDEX "PromptSlotOverride_promptId_idx" ON "PromptSlotOverride"("promptId");
CREATE INDEX "PromptSlotOverride_novelId_promptId_idx" ON "PromptSlotOverride"("novelId", "promptId");

ALTER TABLE "PromptSlotOverride" ADD CONSTRAINT "PromptSlotOverride_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
