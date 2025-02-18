-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_base_characters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "personality" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "development" TEXT NOT NULL,
    "appearance" TEXT NOT NULL DEFAULT '',
    "weaknesses" TEXT NOT NULL DEFAULT '',
    "interests" TEXT NOT NULL DEFAULT '',
    "keyEvents" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_base_characters" ("background", "category", "createdAt", "development", "id", "name", "personality", "role", "tags", "updatedAt") SELECT "background", "category", "createdAt", "development", "id", "name", "personality", "role", "tags", "updatedAt" FROM "base_characters";
DROP TABLE "base_characters";
ALTER TABLE "new_base_characters" RENAME TO "base_characters";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
