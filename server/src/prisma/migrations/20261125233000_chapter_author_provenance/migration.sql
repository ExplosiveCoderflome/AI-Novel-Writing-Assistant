ALTER TABLE "Chapter" ADD COLUMN "authorProvenance" TEXT NOT NULL DEFAULT 'ai_generated';
ALTER TABLE "Chapter" ADD COLUMN "humanEditedAt" TIMESTAMP(3);
