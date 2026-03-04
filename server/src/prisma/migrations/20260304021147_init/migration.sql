-- CreateTable
CREATE TABLE "Novel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "outline" TEXT,
    "structuredOutline" TEXT,
    "genreId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Novel_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "NovelGenre" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT DEFAULT '',
    "order" INTEGER NOT NULL,
    "novelId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Chapter_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "personality" TEXT,
    "background" TEXT,
    "development" TEXT,
    "novelId" TEXT NOT NULL,
    "baseCharacterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Character_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BaseCharacter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "personality" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "development" TEXT NOT NULL,
    "appearance" TEXT,
    "weaknesses" TEXT,
    "interests" TEXT,
    "keyEvents" TEXT,
    "tags" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NovelGenre" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "template" TEXT,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NovelGenre_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NovelGenre" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "World" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "background" TEXT,
    "geography" TEXT,
    "cultures" TEXT,
    "magicSystem" TEXT,
    "politics" TEXT,
    "races" TEXT,
    "religions" TEXT,
    "technology" TEXT,
    "conflicts" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorldPropertyLibrary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "worldType" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WritingFormula" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sourceText" TEXT,
    "content" TEXT,
    "genre" TEXT,
    "style" TEXT,
    "toneVoice" TEXT,
    "structure" TEXT,
    "pacing" TEXT,
    "paragraphPattern" TEXT,
    "sentenceStructure" TEXT,
    "vocabularyLevel" TEXT,
    "rhetoricalDevices" TEXT,
    "narrativeMode" TEXT,
    "perspectivePoint" TEXT,
    "characterVoice" TEXT,
    "themes" TEXT,
    "motifs" TEXT,
    "emotionalTone" TEXT,
    "uniqueFeatures" TEXT,
    "formulaDescription" TEXT,
    "formulaSteps" TEXT,
    "applicationTips" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TitleLibrary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "clickRate" REAL,
    "keywords" TEXT,
    "genreId" TEXT,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "APIKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "model" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Novel_genreId_idx" ON "Novel"("genreId");

-- CreateIndex
CREATE INDEX "Chapter_novelId_order_idx" ON "Chapter"("novelId", "order");

-- CreateIndex
CREATE INDEX "Character_novelId_idx" ON "Character"("novelId");

-- CreateIndex
CREATE INDEX "Character_baseCharacterId_idx" ON "Character"("baseCharacterId");

-- CreateIndex
CREATE INDEX "NovelGenre_parentId_idx" ON "NovelGenre"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "APIKey_provider_key" ON "APIKey"("provider");
