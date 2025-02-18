/*
  Warnings:

  - You are about to drop the column `notes` on the `novels` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "personality" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "development" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Character_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "novels" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_novels" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "genreId" TEXT,
    "coverImage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "authorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "outline" TEXT,
    CONSTRAINT "novels_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "NovelGenre" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_novels" ("authorId", "coverImage", "createdAt", "description", "genreId", "id", "outline", "status", "title", "updatedAt") SELECT "authorId", "coverImage", "createdAt", "description", "genreId", "id", "outline", "status", "title", "updatedAt" FROM "novels";
DROP TABLE "novels";
ALTER TABLE "new_novels" RENAME TO "novels";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Character_novelId_idx" ON "Character"("novelId");
