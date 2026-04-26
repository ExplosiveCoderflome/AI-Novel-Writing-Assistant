ALTER TABLE "StyleExtractionTask"
ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "StyleExtractionTask"
ALTER COLUMN "status" TYPE "PipelineJobStatus"
USING "status"::"PipelineJobStatus";

ALTER TABLE "StyleExtractionTask"
ALTER COLUMN "status" SET DEFAULT 'queued'::"PipelineJobStatus";
