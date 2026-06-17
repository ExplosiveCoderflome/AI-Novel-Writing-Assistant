ALTER TABLE "DramaVideoPrompt" ADD COLUMN IF NOT EXISTS "resultUrl" TEXT;
ALTER TABLE "DramaVideoPrompt" ADD COLUMN IF NOT EXISTS "failureReason" TEXT;
