-- 补充 ComicCharacterAsset / ComicScene 建表（20260612 add_comic_module 迁移
-- 漏建这两张表；schema.prisma 已有定义，此处对齐，修复迁移建库环境报
-- "table does not exist"）
CREATE TABLE "ComicCharacterAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "characterId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageData" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ComicCharacterAsset_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "ComicCharacter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComicCharacterAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ComicCharacterAsset_characterId_idx" ON "ComicCharacterAsset"("characterId");
CREATE INDEX "ComicCharacterAsset_projectId_idx" ON "ComicCharacterAsset"("projectId");

CREATE TABLE "ComicScene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sceneType" TEXT NOT NULL DEFAULT 'interior',
    "bible" TEXT,
    "sheetData" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ComicScene_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ComicScene_projectId_idx" ON "ComicScene"("projectId");
