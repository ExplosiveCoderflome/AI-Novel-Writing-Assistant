ALTER TABLE "StyleExtractionTask"
ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'from_text';

ALTER TABLE "StyleExtractionTask"
ADD COLUMN "sourceRefId" TEXT;

ALTER TABLE "StyleExtractionTask"
ADD COLUMN "sourceProcessingMode" TEXT NOT NULL DEFAULT 'full_text';

ALTER TABLE "StyleExtractionTask"
ADD COLUMN "sourceInputText" TEXT;

ALTER TABLE "StyleExtractionTask"
ADD COLUMN "sourceInputCharLimit" INTEGER;

ALTER TABLE "StyleExtractionTask"
ADD COLUMN "sourceInputCharCount" INTEGER;

CREATE INDEX "StyleExtractionTask_sourceType_sourceRefId_idx"
ON "StyleExtractionTask"("sourceType", "sourceRefId");
