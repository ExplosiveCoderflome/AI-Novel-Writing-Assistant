CREATE TABLE "StyleProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "tagsJson" TEXT,
    "applicableGenresJson" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceRefId" TEXT,
    "sourceContent" TEXT,
    "extractedFeaturesJson" TEXT,
    "analysisMarkdown" TEXT,
    "narrativeRulesJson" TEXT,
    "characterRulesJson" TEXT,
    "languageRulesJson" TEXT,
    "rhythmRulesJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "StyleProfile_status_updatedAt_idx"
ON "StyleProfile"("status", "updatedAt");

CREATE INDEX "StyleProfile_sourceType_sourceRefId_idx"
ON "StyleProfile"("sourceType", "sourceRefId");

CREATE TABLE "StyleTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tagsJson" TEXT,
    "applicableGenresJson" TEXT,
    "analysisMarkdown" TEXT,
    "narrativeRulesJson" TEXT,
    "characterRulesJson" TEXT,
    "languageRulesJson" TEXT,
    "rhythmRulesJson" TEXT,
    "defaultAntiAiRuleKeysJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "StyleTemplate_key_key"
ON "StyleTemplate"("key");

CREATE TABLE "AntiAiRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "detectPatternsJson" TEXT,
    "rewriteSuggestion" TEXT,
    "promptInstruction" TEXT,
    "autoRewrite" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "AntiAiRule_key_key"
ON "AntiAiRule"("key");

CREATE INDEX "AntiAiRule_type_enabled_idx"
ON "AntiAiRule"("type", "enabled");

CREATE TABLE "StyleProfileAntiAiRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "styleProfileId" TEXT NOT NULL,
    "antiAiRuleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "weight" REAL NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StyleProfileAntiAiRule_styleProfileId_fkey" FOREIGN KEY ("styleProfileId") REFERENCES "StyleProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StyleProfileAntiAiRule_antiAiRuleId_fkey" FOREIGN KEY ("antiAiRuleId") REFERENCES "AntiAiRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StyleProfileAntiAiRule_styleProfileId_antiAiRuleId_key"
ON "StyleProfileAntiAiRule"("styleProfileId", "antiAiRuleId");

CREATE INDEX "StyleProfileAntiAiRule_antiAiRuleId_idx"
ON "StyleProfileAntiAiRule"("antiAiRuleId");

CREATE TABLE "StyleBinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "styleProfileId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "weight" REAL NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StyleBinding_styleProfileId_fkey" FOREIGN KEY ("styleProfileId") REFERENCES "StyleProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "StyleBinding_targetType_targetId_enabled_idx"
ON "StyleBinding"("targetType", "targetId", "enabled");

CREATE INDEX "StyleBinding_styleProfileId_idx"
ON "StyleBinding"("styleProfileId");
