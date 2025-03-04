-- CreateTable
CREATE TABLE "saved_titles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "keywords" TEXT,
    "genreId" TEXT,
    "genreName" TEXT,
    "clickRate" INTEGER,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Character" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "personality" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "development" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "baseCharacterId" TEXT,
    CONSTRAINT "Character_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "novels" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Character_baseCharacterId_fkey" FOREIGN KEY ("baseCharacterId") REFERENCES "base_characters" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Character" ("background", "baseCharacterId", "createdAt", "development", "id", "name", "novelId", "personality", "role", "updatedAt") SELECT "background", "baseCharacterId", "createdAt", "development", "id", "name", "novelId", "personality", "role", "updatedAt" FROM "Character";
DROP TABLE "Character";
ALTER TABLE "new_Character" RENAME TO "Character";
CREATE INDEX "Character_novelId_idx" ON "Character"("novelId");
CREATE INDEX "Character_baseCharacterId_idx" ON "Character"("baseCharacterId");
CREATE TABLE "new_NovelGenre" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "template" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "parentId" TEXT,
    CONSTRAINT "NovelGenre_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NovelGenre" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_NovelGenre" ("createdAt", "description", "id", "name", "parentId", "template", "updatedAt") SELECT "createdAt", "description", "id", "name", "parentId", "template", "updatedAt" FROM "NovelGenre";
DROP TABLE "NovelGenre";
ALTER TABLE "new_NovelGenre" RENAME TO "NovelGenre";
CREATE UNIQUE INDEX "NovelGenre_parentId_name_key" ON "NovelGenre"("parentId", "name");
CREATE TABLE "new_api_keys" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "model" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL
);
INSERT INTO "new_api_keys" ("createdAt", "id", "isActive", "key", "model", "provider", "updatedAt", "userId") SELECT "createdAt", "id", "isActive", "key", "model", "provider", "updatedAt", "userId" FROM "api_keys";
DROP TABLE "api_keys";
ALTER TABLE "new_api_keys" RENAME TO "api_keys";
CREATE UNIQUE INDEX "api_keys_provider_userId_key" ON "api_keys"("provider", "userId");
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
INSERT INTO "new_base_characters" ("appearance", "background", "category", "createdAt", "development", "id", "interests", "keyEvents", "name", "personality", "role", "tags", "updatedAt", "weaknesses") SELECT "appearance", "background", "category", "createdAt", "development", "id", "interests", "keyEvents", "name", "personality", "role", "tags", "updatedAt", "weaknesses" FROM "base_characters";
DROP TABLE "base_characters";
ALTER TABLE "new_base_characters" RENAME TO "base_characters";
CREATE TABLE "new_chapters" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "novelId" TEXT NOT NULL,
    CONSTRAINT "chapters_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "novels" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_chapters" ("content", "createdAt", "id", "novelId", "order", "title", "updatedAt") SELECT "content", "createdAt", "id", "novelId", "order", "title", "updatedAt" FROM "chapters";
DROP TABLE "chapters";
ALTER TABLE "new_chapters" RENAME TO "chapters";
CREATE TABLE "new_character_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "genreId" TEXT NOT NULL,
    "template" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "character_templates_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "NovelGenre" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_character_templates" ("createdAt", "genreId", "id", "template", "updatedAt") SELECT "createdAt", "genreId", "id", "template", "updatedAt" FROM "character_templates";
DROP TABLE "character_templates";
ALTER TABLE "new_character_templates" RENAME TO "character_templates";
CREATE UNIQUE INDEX "character_templates_genreId_key" ON "character_templates"("genreId");
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
    "structuredOutline" TEXT,
    CONSTRAINT "novels_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "NovelGenre" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_novels" ("authorId", "coverImage", "createdAt", "description", "genreId", "id", "outline", "status", "structuredOutline", "title", "updatedAt") SELECT "authorId", "coverImage", "createdAt", "description", "genreId", "id", "outline", "status", "structuredOutline", "title", "updatedAt" FROM "novels";
DROP TABLE "novels";
ALTER TABLE "new_novels" RENAME TO "novels";
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_users" ("createdAt", "email", "id", "name", "password", "role", "updatedAt") SELECT "createdAt", "email", "id", "name", "password", "role", "updatedAt" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "saved_titles_userId_idx" ON "saved_titles"("userId");
