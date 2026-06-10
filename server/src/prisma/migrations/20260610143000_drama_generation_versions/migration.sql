ALTER TABLE "DramaVideoPrompt" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "DramaVideoPrompt" ADD COLUMN IF NOT EXISTS "supersededById" TEXT;

CREATE INDEX IF NOT EXISTS "DramaVideoPrompt_projectId_shotId_version_idx" ON "DramaVideoPrompt"("projectId", "shotId", "version");
