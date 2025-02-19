-- AlterTable
ALTER TABLE "NovelGenre" ADD COLUMN "template" TEXT;

-- CreateTable
CREATE TABLE "character_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "genreId" TEXT NOT NULL,
    "template" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "character_templates_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "NovelGenre" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "character_templates_genreId_key" ON "character_templates"("genreId");
