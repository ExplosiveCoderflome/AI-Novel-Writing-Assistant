ALTER TABLE "World" ADD COLUMN "structureJson" TEXT;
ALTER TABLE "World" ADD COLUMN "bindingSupportJson" TEXT;
ALTER TABLE "World" ADD COLUMN "structureSchemaVersion" INTEGER NOT NULL DEFAULT 1;
