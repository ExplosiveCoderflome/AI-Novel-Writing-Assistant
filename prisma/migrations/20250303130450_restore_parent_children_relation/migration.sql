-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NovelGenre" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "template" TEXT,
    "parentId" TEXT,
    CONSTRAINT "NovelGenre_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NovelGenre" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_NovelGenre" ("description", "id", "name", "template") SELECT "description", "id", "name", "template" FROM "NovelGenre";
DROP TABLE "NovelGenre";
ALTER TABLE "new_NovelGenre" RENAME TO "NovelGenre";
CREATE INDEX "NovelGenre_parentId_idx" ON "NovelGenre"("parentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
