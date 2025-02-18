/*
  Warnings:

  - You are about to drop the column `genre` on the `novels` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NovelGenre" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_novels" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "coverImage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "authorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "outline" TEXT,
    "notes" TEXT,
    "genreId" TEXT,
    CONSTRAINT "novels_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "NovelGenre" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_novels" ("authorId", "coverImage", "createdAt", "description", "id", "notes", "outline", "status", "title", "updatedAt") SELECT "authorId", "coverImage", "createdAt", "description", "id", "notes", "outline", "status", "title", "updatedAt" FROM "novels";
DROP TABLE "novels";
ALTER TABLE "new_novels" RENAME TO "novels";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "NovelGenre_name_key" ON "NovelGenre"("name");
