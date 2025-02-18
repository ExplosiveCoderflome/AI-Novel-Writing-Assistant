-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NovelGenre" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "parentId" TEXT,
    CONSTRAINT "NovelGenre_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NovelGenre" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_NovelGenre" ("createdAt", "description", "id", "name", "updatedAt") SELECT "createdAt", "description", "id", "name", "updatedAt" FROM "NovelGenre";
DROP TABLE "NovelGenre";
ALTER TABLE "new_NovelGenre" RENAME TO "NovelGenre";
CREATE UNIQUE INDEX "NovelGenre_parentId_name_key" ON "NovelGenre"("parentId", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
