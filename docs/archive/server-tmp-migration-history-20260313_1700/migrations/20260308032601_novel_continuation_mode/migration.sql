-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Novel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "writingMode" TEXT NOT NULL DEFAULT 'original',
    "sourceNovelId" TEXT,
    "outline" TEXT,
    "structuredOutline" TEXT,
    "genreId" TEXT,
    "worldId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Novel_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "NovelGenre" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Novel_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Novel_sourceNovelId_fkey" FOREIGN KEY ("sourceNovelId") REFERENCES "Novel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Novel" ("createdAt", "description", "genreId", "id", "outline", "status", "structuredOutline", "title", "updatedAt", "worldId") SELECT "createdAt", "description", "genreId", "id", "outline", "status", "structuredOutline", "title", "updatedAt", "worldId" FROM "Novel";
DROP TABLE "Novel";
ALTER TABLE "new_Novel" RENAME TO "Novel";
CREATE INDEX "Novel_genreId_idx" ON "Novel"("genreId");
CREATE INDEX "Novel_worldId_idx" ON "Novel"("worldId");
CREATE INDEX "Novel_writingMode_idx" ON "Novel"("writingMode");
CREATE INDEX "Novel_sourceNovelId_idx" ON "Novel"("sourceNovelId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
