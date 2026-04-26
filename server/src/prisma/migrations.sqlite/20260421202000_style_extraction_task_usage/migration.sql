ALTER TABLE "StyleExtractionTask"
ADD COLUMN "promptTokens" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "StyleExtractionTask"
ADD COLUMN "completionTokens" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "StyleExtractionTask"
ADD COLUMN "totalTokens" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "StyleExtractionTask"
ADD COLUMN "llmCallCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "StyleExtractionTask"
ADD COLUMN "lastTokenRecordedAt" DATETIME;
