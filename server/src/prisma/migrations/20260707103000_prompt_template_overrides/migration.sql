-- Additive tables for book-scoped advanced prompt templates.

CREATE TABLE "PromptTemplateOverride" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'novel',
  "novelId" TEXT NOT NULL,
  "promptId" TEXT NOT NULL,
  "basePromptVersion" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'official',
  "activeVersionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PromptTemplateOverride_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromptTemplateVersion" (
  "id" TEXT NOT NULL,
  "overrideId" TEXT NOT NULL,
  "versionNo" INTEGER NOT NULL,
  "templateJson" TEXT NOT NULL,
  "contextRefsJson" TEXT NOT NULL DEFAULT '{}',
  "compiledHash" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromptTemplateVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromptTemplateOverride_scope_novelId_promptId_key" ON "PromptTemplateOverride"("scope", "novelId", "promptId");
CREATE INDEX "PromptTemplateOverride_promptId_idx" ON "PromptTemplateOverride"("promptId");
CREATE INDEX "PromptTemplateOverride_novelId_promptId_idx" ON "PromptTemplateOverride"("novelId", "promptId");
CREATE INDEX "PromptTemplateOverride_activeVersionId_idx" ON "PromptTemplateOverride"("activeVersionId");
CREATE UNIQUE INDEX "PromptTemplateVersion_overrideId_versionNo_key" ON "PromptTemplateVersion"("overrideId", "versionNo");
CREATE INDEX "PromptTemplateVersion_overrideId_createdAt_idx" ON "PromptTemplateVersion"("overrideId", "createdAt");

ALTER TABLE "PromptTemplateOverride" ADD CONSTRAINT "PromptTemplateOverride_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromptTemplateVersion" ADD CONSTRAINT "PromptTemplateVersion_overrideId_fkey" FOREIGN KEY ("overrideId") REFERENCES "PromptTemplateOverride"("id") ON DELETE CASCADE ON UPDATE CASCADE;
