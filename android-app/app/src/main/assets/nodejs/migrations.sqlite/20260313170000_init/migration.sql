-- CreateTable
CREATE TABLE "Novel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "writingMode" TEXT NOT NULL DEFAULT 'original',
    "projectMode" TEXT,
    "narrativePov" TEXT,
    "pacePreference" TEXT,
    "styleTone" TEXT,
    "emotionIntensity" TEXT,
    "aiFreedom" TEXT,
    "defaultChapterLength" INTEGER,
    "projectStatus" TEXT DEFAULT 'not_started',
    "storylineStatus" TEXT DEFAULT 'not_started',
    "outlineStatus" TEXT DEFAULT 'not_started',
    "resourceReadyScore" INTEGER,
    "sourceNovelId" TEXT,
    "sourceKnowledgeDocumentId" TEXT,
    "continuationBookAnalysisId" TEXT,
    "continuationBookAnalysisSections" TEXT,
    "outline" TEXT,
    "structuredOutline" TEXT,
    "genreId" TEXT,
    "worldId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Novel_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "NovelGenre" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Novel_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Novel_sourceNovelId_fkey" FOREIGN KEY ("sourceNovelId") REFERENCES "Novel" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Novel_sourceKnowledgeDocumentId_fkey" FOREIGN KEY ("sourceKnowledgeDocumentId") REFERENCES "KnowledgeDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Novel_continuationBookAnalysisId_fkey" FOREIGN KEY ("continuationBookAnalysisId") REFERENCES "BookAnalysis" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreativeDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "importance" TEXT NOT NULL DEFAULT 'normal',
    "expiresAt" INTEGER,
    "sourceType" TEXT,
    "sourceRefId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreativeDecision_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NovelSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "label" TEXT,
    "snapshotData" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NovelSnapshot_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT DEFAULT '',
    "order" INTEGER NOT NULL,
    "generationState" TEXT NOT NULL DEFAULT 'planned',
    "chapterStatus" TEXT DEFAULT 'unplanned',
    "targetWordCount" INTEGER,
    "conflictLevel" INTEGER,
    "revealLevel" INTEGER,
    "mustAvoid" TEXT,
    "taskSheet" TEXT,
    "sceneCards" TEXT,
    "repairHistory" TEXT,
    "qualityScore" INTEGER,
    "continuityScore" INTEGER,
    "characterScore" INTEGER,
    "pacingScore" INTEGER,
    "riskFlags" TEXT,
    "hook" TEXT,
    "expectation" TEXT,
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
    "currentState" TEXT,
    "currentGoal" TEXT,
    "lastEvolvedAt" DATETIME,
    "novelId" TEXT NOT NULL,
    "baseCharacterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Character_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CharacterTimeline" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "chapterId" TEXT,
    "chapterOrder" INTEGER,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharacterTimeline_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterTimeline_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterTimeline_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
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
CREATE TABLE "ImageGenerationTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sceneType" TEXT NOT NULL DEFAULT 'character',
    "baseCharacterId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT,
    "stylePreset" TEXT,
    "size" TEXT NOT NULL DEFAULT '1024x1024',
    "imageCount" INTEGER NOT NULL DEFAULT 1,
    "seed" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" REAL NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "heartbeatAt" DATETIME,
    "currentStage" TEXT,
    "currentItemKey" TEXT,
    "currentItemLabel" TEXT,
    "cancelRequestedAt" DATETIME,
    "error" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImageGenerationTask_baseCharacterId_fkey" FOREIGN KEY ("baseCharacterId") REFERENCES "BaseCharacter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImageAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "sceneType" TEXT NOT NULL DEFAULT 'character',
    "baseCharacterId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "seed" INTEGER,
    "prompt" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImageAsset_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ImageGenerationTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImageAsset_baseCharacterId_fkey" FOREIGN KEY ("baseCharacterId") REFERENCES "BaseCharacter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "worldType" TEXT,
    "templateKey" TEXT,
    "axioms" TEXT,
    "background" TEXT,
    "geography" TEXT,
    "cultures" TEXT,
    "magicSystem" TEXT,
    "politics" TEXT,
    "races" TEXT,
    "religions" TEXT,
    "technology" TEXT,
    "conflicts" TEXT,
    "history" TEXT,
    "economy" TEXT,
    "factions" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "selectedDimensions" TEXT,
    "selectedElements" TEXT,
    "layerStates" TEXT,
    "consistencyReport" TEXT,
    "overviewSummary" TEXT,
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
    "sourceWorldId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorldPropertyLibrary_sourceWorldId_fkey" FOREIGN KEY ("sourceWorldId") REFERENCES "World" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorldSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "label" TEXT,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorldSnapshot_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorldDeepeningQA" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'recommended',
    "question" TEXT NOT NULL,
    "targetLayer" TEXT,
    "targetField" TEXT,
    "answer" TEXT,
    "integratedSummary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorldDeepeningQA_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorldConsistencyIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" TEXT,
    "source" TEXT NOT NULL DEFAULT 'rule',
    "status" TEXT NOT NULL DEFAULT 'open',
    "targetField" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorldConsistencyIssue_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ModelRouteConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "temperature" REAL NOT NULL DEFAULT 0.7,
    "maxTokens" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NovelBible" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "coreSetting" TEXT,
    "forbiddenRules" TEXT,
    "mainPromise" TEXT,
    "characterArcs" TEXT,
    "worldRules" TEXT,
    "rawContent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NovelBible_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlotBeat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "chapterOrder" INTEGER,
    "beatType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlotBeat_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChapterSummary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keyEvents" TEXT,
    "characterStates" TEXT,
    "hook" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChapterSummary_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChapterSummary_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConsistencyFact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'plot',
    "content" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConsistencyFact_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConsistencyFact_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "startOrder" INTEGER NOT NULL,
    "endOrder" INTEGER NOT NULL,
    "runMode" TEXT DEFAULT 'fast',
    "autoReview" BOOLEAN NOT NULL DEFAULT true,
    "autoRepair" BOOLEAN NOT NULL DEFAULT true,
    "skipCompleted" BOOLEAN NOT NULL DEFAULT true,
    "qualityThreshold" INTEGER,
    "repairMode" TEXT DEFAULT 'light_repair',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" REAL NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "heartbeatAt" DATETIME,
    "currentStage" TEXT,
    "currentItemKey" TEXT,
    "currentItemLabel" TEXT,
    "cancelRequestedAt" DATETIME,
    "error" TEXT,
    "lastErrorType" TEXT,
    "payload" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GenerationJob_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT,
    "chapterId" TEXT,
    "sessionId" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "entryAgent" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "currentStep" TEXT,
    "currentAgent" TEXT,
    "error" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentRun_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "agentName" TEXT NOT NULL,
    "stepType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'succeeded',
    "parentStepId" TEXT,
    "idempotencyKey" TEXT,
    "inputJson" TEXT,
    "outputJson" TEXT,
    "error" TEXT,
    "errorCode" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "tokenUsageJson" TEXT,
    "costUsd" REAL,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "stepId" TEXT,
    "approvalType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "diffSummary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" DATETIME,
    "decisionNote" TEXT,
    "decider" TEXT,
    "decidedAt" DATETIME,
    "payloadJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentApproval_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgentApproval_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "AgentStep" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreativeHubThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL DEFAULT '新对话',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "latestRunId" TEXT,
    "latestError" TEXT,
    "resourceBindingsJson" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CreativeHubCheckpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "parentCheckpointId" TEXT,
    "runId" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "preview" TEXT,
    "messagesJson" TEXT NOT NULL,
    "interruptsJson" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreativeHubCheckpoint_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CreativeHubThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StorylineVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "content" TEXT NOT NULL,
    "diffSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StorylineVersion_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QualityReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "coherence" INTEGER NOT NULL,
    "repetition" INTEGER NOT NULL,
    "pacing" INTEGER NOT NULL,
    "voice" INTEGER NOT NULL,
    "engagement" INTEGER NOT NULL,
    "overall" INTEGER NOT NULL,
    "issues" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QualityReport_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QualityReport_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'enabled',
    "activeVersionId" TEXT,
    "activeVersionNumber" INTEGER NOT NULL DEFAULT 0,
    "latestIndexStatus" TEXT NOT NULL DEFAULT 'idle',
    "lastIndexedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnowledgeDocument_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "KnowledgeDocumentVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeDocumentVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeBinding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeBinding_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BookAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "summary" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "temperature" REAL,
    "maxTokens" INTEGER,
    "progress" REAL NOT NULL DEFAULT 0,
    "heartbeatAt" DATETIME,
    "currentStage" TEXT,
    "currentItemKey" TEXT,
    "currentItemLabel" TEXT,
    "cancelRequestedAt" DATETIME,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "lastRunAt" DATETIME,
    "publishedDocumentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BookAnalysis_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BookAnalysis_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "KnowledgeDocumentVersion" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    CONSTRAINT "BookAnalysis_publishedDocumentId_fkey" FOREIGN KEY ("publishedDocumentId") REFERENCES "KnowledgeDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BookAnalysisSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "aiContent" TEXT,
    "editedContent" TEXT,
    "notes" TEXT,
    "structuredDataJson" TEXT,
    "evidenceJson" TEXT,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BookAnalysisSection_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "BookAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "novelId" TEXT,
    "worldId" TEXT,
    "title" TEXT,
    "chunkText" TEXT NOT NULL,
    "chunkHash" TEXT NOT NULL,
    "chunkOrder" INTEGER NOT NULL,
    "tokenEstimate" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT NOT NULL DEFAULT 'zh',
    "metadataJson" TEXT,
    "embedProvider" TEXT NOT NULL,
    "embedModel" TEXT NOT NULL,
    "embedVersion" INTEGER NOT NULL DEFAULT 1,
    "indexedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RagIndexJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "jobType" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAfter" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadJson" TEXT,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Novel_genreId_idx" ON "Novel"("genreId");

-- CreateIndex
CREATE INDEX "Novel_worldId_idx" ON "Novel"("worldId");

-- CreateIndex
CREATE INDEX "Novel_writingMode_idx" ON "Novel"("writingMode");

-- CreateIndex
CREATE INDEX "Novel_sourceNovelId_idx" ON "Novel"("sourceNovelId");

-- CreateIndex
CREATE INDEX "Novel_sourceKnowledgeDocumentId_idx" ON "Novel"("sourceKnowledgeDocumentId");

-- CreateIndex
CREATE INDEX "Novel_continuationBookAnalysisId_idx" ON "Novel"("continuationBookAnalysisId");

-- CreateIndex
CREATE INDEX "CreativeDecision_novelId_createdAt_idx" ON "CreativeDecision"("novelId", "createdAt");

-- CreateIndex
CREATE INDEX "NovelSnapshot_novelId_createdAt_idx" ON "NovelSnapshot"("novelId", "createdAt");

-- CreateIndex
CREATE INDEX "Chapter_novelId_order_idx" ON "Chapter"("novelId", "order");

-- CreateIndex
CREATE INDEX "Character_novelId_idx" ON "Character"("novelId");

-- CreateIndex
CREATE INDEX "Character_baseCharacterId_idx" ON "Character"("baseCharacterId");

-- CreateIndex
CREATE INDEX "CharacterTimeline_novelId_characterId_idx" ON "CharacterTimeline"("novelId", "characterId");

-- CreateIndex
CREATE INDEX "CharacterTimeline_characterId_chapterOrder_idx" ON "CharacterTimeline"("characterId", "chapterOrder");

-- CreateIndex
CREATE INDEX "CharacterTimeline_chapterId_idx" ON "CharacterTimeline"("chapterId");

-- CreateIndex
CREATE INDEX "ImageGenerationTask_sceneType_status_idx" ON "ImageGenerationTask"("sceneType", "status");

-- CreateIndex
CREATE INDEX "ImageGenerationTask_baseCharacterId_createdAt_idx" ON "ImageGenerationTask"("baseCharacterId", "createdAt");

-- CreateIndex
CREATE INDEX "ImageAsset_taskId_idx" ON "ImageAsset"("taskId");

-- CreateIndex
CREATE INDEX "ImageAsset_sceneType_createdAt_idx" ON "ImageAsset"("sceneType", "createdAt");

-- CreateIndex
CREATE INDEX "ImageAsset_baseCharacterId_isPrimary_createdAt_idx" ON "ImageAsset"("baseCharacterId", "isPrimary", "createdAt");

-- CreateIndex
CREATE INDEX "NovelGenre_parentId_idx" ON "NovelGenre"("parentId");

-- CreateIndex
CREATE INDEX "WorldPropertyLibrary_sourceWorldId_idx" ON "WorldPropertyLibrary"("sourceWorldId");

-- CreateIndex
CREATE INDEX "WorldSnapshot_worldId_createdAt_idx" ON "WorldSnapshot"("worldId", "createdAt");

-- CreateIndex
CREATE INDEX "WorldDeepeningQA_worldId_status_idx" ON "WorldDeepeningQA"("worldId", "status");

-- CreateIndex
CREATE INDEX "WorldConsistencyIssue_worldId_status_idx" ON "WorldConsistencyIssue"("worldId", "status");

-- CreateIndex
CREATE INDEX "WorldConsistencyIssue_worldId_severity_idx" ON "WorldConsistencyIssue"("worldId", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "APIKey_provider_key" ON "APIKey"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "ModelRouteConfig_taskType_key" ON "ModelRouteConfig"("taskType");

-- CreateIndex
CREATE UNIQUE INDEX "NovelBible_novelId_key" ON "NovelBible"("novelId");

-- CreateIndex
CREATE INDEX "PlotBeat_novelId_idx" ON "PlotBeat"("novelId");

-- CreateIndex
CREATE INDEX "PlotBeat_novelId_chapterOrder_idx" ON "PlotBeat"("novelId", "chapterOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ChapterSummary_chapterId_key" ON "ChapterSummary"("chapterId");

-- CreateIndex
CREATE INDEX "ChapterSummary_novelId_idx" ON "ChapterSummary"("novelId");

-- CreateIndex
CREATE INDEX "ConsistencyFact_novelId_idx" ON "ConsistencyFact"("novelId");

-- CreateIndex
CREATE INDEX "ConsistencyFact_chapterId_idx" ON "ConsistencyFact"("chapterId");

-- CreateIndex
CREATE INDEX "ConsistencyFact_novelId_category_idx" ON "ConsistencyFact"("novelId", "category");

-- CreateIndex
CREATE INDEX "GenerationJob_novelId_idx" ON "GenerationJob"("novelId");

-- CreateIndex
CREATE INDEX "GenerationJob_novelId_status_idx" ON "GenerationJob"("novelId", "status");

-- CreateIndex
CREATE INDEX "AgentRun_status_updatedAt_idx" ON "AgentRun"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "AgentRun_novelId_createdAt_idx" ON "AgentRun"("novelId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_novelId_chapterId_createdAt_idx" ON "AgentRun"("novelId", "chapterId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_sessionId_createdAt_idx" ON "AgentRun"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentStep_runId_idempotencyKey_idx" ON "AgentStep"("runId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentStep_runId_parentStepId_idx" ON "AgentStep"("runId", "parentStepId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentStep_runId_seq_key" ON "AgentStep"("runId", "seq");

-- CreateIndex
CREATE INDEX "AgentApproval_runId_status_idx" ON "AgentApproval"("runId", "status");

-- CreateIndex
CREATE INDEX "AgentApproval_stepId_idx" ON "AgentApproval"("stepId");

-- CreateIndex
CREATE INDEX "AgentApproval_status_expiresAt_idx" ON "AgentApproval"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "CreativeHubThread_archived_updatedAt_idx" ON "CreativeHubThread"("archived", "updatedAt");

-- CreateIndex
CREATE INDEX "CreativeHubThread_status_updatedAt_idx" ON "CreativeHubThread"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "CreativeHubCheckpoint_threadId_createdAt_idx" ON "CreativeHubCheckpoint"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreativeHubCheckpoint_threadId_checkpointId_key" ON "CreativeHubCheckpoint"("threadId", "checkpointId");

-- CreateIndex
CREATE INDEX "StorylineVersion_novelId_status_createdAt_idx" ON "StorylineVersion"("novelId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StorylineVersion_novelId_version_key" ON "StorylineVersion"("novelId", "version");

-- CreateIndex
CREATE INDEX "QualityReport_novelId_idx" ON "QualityReport"("novelId");

-- CreateIndex
CREATE INDEX "QualityReport_chapterId_idx" ON "QualityReport"("chapterId");

-- CreateIndex
CREATE INDEX "QualityReport_novelId_createdAt_idx" ON "QualityReport"("novelId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_status_updatedAt_idx" ON "KnowledgeDocument"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "KnowledgeDocument_title_idx" ON "KnowledgeDocument"("title");

-- CreateIndex
CREATE INDEX "KnowledgeDocumentVersion_documentId_createdAt_idx" ON "KnowledgeDocumentVersion"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeDocumentVersion_contentHash_idx" ON "KnowledgeDocumentVersion"("contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDocumentVersion_documentId_versionNumber_key" ON "KnowledgeDocumentVersion"("documentId", "versionNumber");

-- CreateIndex
CREATE INDEX "KnowledgeBinding_targetType_targetId_idx" ON "KnowledgeBinding"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "KnowledgeBinding_documentId_idx" ON "KnowledgeBinding"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeBinding_targetType_targetId_documentId_key" ON "KnowledgeBinding"("targetType", "targetId", "documentId");

-- CreateIndex
CREATE INDEX "BookAnalysis_documentId_status_idx" ON "BookAnalysis"("documentId", "status");

-- CreateIndex
CREATE INDEX "BookAnalysis_documentVersionId_idx" ON "BookAnalysis"("documentVersionId");

-- CreateIndex
CREATE INDEX "BookAnalysis_status_updatedAt_idx" ON "BookAnalysis"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "BookAnalysisSection_analysisId_sortOrder_idx" ON "BookAnalysisSection"("analysisId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "BookAnalysisSection_analysisId_sectionKey_key" ON "BookAnalysisSection"("analysisId", "sectionKey");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_tenantId_ownerType_ownerId_idx" ON "KnowledgeChunk"("tenantId", "ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_tenantId_novelId_idx" ON "KnowledgeChunk"("tenantId", "novelId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_tenantId_worldId_idx" ON "KnowledgeChunk"("tenantId", "worldId");

-- CreateIndex
CREATE INDEX "KnowledgeChunk_chunkHash_idx" ON "KnowledgeChunk"("chunkHash");

-- CreateIndex
CREATE INDEX "RagIndexJob_status_runAfter_idx" ON "RagIndexJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "RagIndexJob_tenantId_ownerType_ownerId_idx" ON "RagIndexJob"("tenantId", "ownerType", "ownerId");
