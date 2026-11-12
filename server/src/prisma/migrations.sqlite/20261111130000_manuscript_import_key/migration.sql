ALTER TABLE "ManuscriptImportSession" ADD COLUMN "importRequestKey" TEXT;
CREATE UNIQUE INDEX "ManuscriptImportSession_importRequestKey_key" ON "ManuscriptImportSession"("importRequestKey");
