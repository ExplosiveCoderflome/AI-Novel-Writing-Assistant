-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ChapterGenerationState" AS ENUM ('planned', 'drafted', 'reviewed', 'repaired', 'approved', 'published');

-- CreateEnum
CREATE TYPE "PipelineJobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "BeatStatus" AS ENUM ('planned', 'completed', 'skipped');

-- CreateEnum
CREATE TYPE "FactCategory" AS ENUM ('world', 'character', 'timeline', 'plot', 'rule');

-- CreateEnum
CREATE TYPE "RagOwnerType" AS ENUM ('novel', 'chapter', 'world', 'character', 'bible', 'chapter_summary', 'consistency_fact', 'character_timeline', 'world_library_item', 'knowledge_document', 'chat_message');

-- CreateEnum
CREATE TYPE "RagJobType" AS ENUM ('upsert', 'delete', 'rebuild');

-- CreateEnum
CREATE TYPE "RagJobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "KnowledgeDocumentStatus" AS ENUM ('enabled', 'disabled', 'archived');

-- CreateEnum
CREATE TYPE "KnowledgeIndexStatus" AS ENUM ('idle', 'queued', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "KnowledgeBindingTargetType" AS ENUM ('novel', 'world');

-- CreateEnum
CREATE TYPE "BookAnalysisStatus" AS ENUM ('draft', 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'archived');

-- CreateEnum
CREATE TYPE "BookAnalysisSectionStatus" AS ENUM ('idle', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "ImageSceneType" AS ENUM ('character', 'novel_cover', 'chapter_illustration');

-- CreateEnum
CREATE TYPE "ProjectMode" AS ENUM ('ai_led', 'co_pilot', 'draft_mode', 'auto_pipeline');

-- CreateEnum
CREATE TYPE "NarrativePov" AS ENUM ('first_person', 'third_person', 'mixed');

-- CreateEnum
CREATE TYPE "PacePreference" AS ENUM ('slow', 'balanced', 'fast');

-- CreateEnum
CREATE TYPE "EmotionIntensity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "AIFreedom" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "ProjectProgressStatus" AS ENUM ('not_started', 'in_progress', 'completed', 'rework', 'blocked');

-- CreateEnum
CREATE TYPE "StorylineVersionStatus" AS ENUM ('draft', 'active', 'frozen');

-- CreateEnum
CREATE TYPE "VolumePlanVersionStatus" AS ENUM ('draft', 'active', 'frozen');

-- CreateEnum
CREATE TYPE "ChapterStatus" AS ENUM ('unplanned', 'pending_generation', 'generating', 'pending_review', 'needs_repair', 'completed');

-- CreateEnum
CREATE TYPE "PipelineRunMode" AS ENUM ('fast', 'polish');

-- CreateEnum
CREATE TYPE "PipelineRepairMode" AS ENUM ('detect_only', 'light_repair', 'heavy_repair', 'continuity_only', 'character_only', 'ending_only');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "NovelWorkflowLane" AS ENUM ('manual_create', 'auto_director');

-- CreateEnum
CREATE TYPE "NovelWorkflowTaskStatus" AS ENUM ('queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "AgentStepType" AS ENUM ('planning', 'tool_call', 'tool_result', 'reasoning', 'write', 'approval', 'answer');

-- CreateEnum
CREATE TYPE "AgentStepStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "AgentApprovalStatus" AS ENUM ('pending', 'approved', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "CreativeHubThreadStatus" AS ENUM ('idle', 'busy', 'interrupted', 'error');

-- CreateEnum
CREATE TYPE "StoryPlanLevel" AS ENUM ('book', 'arc', 'chapter');

-- CreateEnum
CREATE TYPE "StoryPlanRole" AS ENUM ('setup', 'progress', 'pressure', 'turn', 'payoff', 'cooldown');

-- CreateEnum
CREATE TYPE "AuditType" AS ENUM ('continuity', 'character', 'plot', 'mode_fit');

-- CreateEnum
CREATE TYPE "AuditIssueStatus" AS ENUM ('open', 'resolved', 'ignored');

-- CreateEnum
CREATE TYPE "PayoffLedgerScopeType" AS ENUM ('book', 'volume', 'chapter');

-- CreateEnum
CREATE TYPE "PayoffLedgerStatus" AS ENUM ('setup', 'hinted', 'pending_payoff', 'paid_off', 'failed', 'overdue');

-- CreateEnum
CREATE TYPE "StyleBindingTargetType" AS ENUM ('novel', 'chapter', 'task');

-- CreateEnum
CREATE TYPE "AntiAiRuleType" AS ENUM ('forbidden', 'risk', 'encourage');

-- CreateEnum
CREATE TYPE "AntiAiSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "CharacterGender" AS ENUM ('male', 'female', 'other', 'unknown');

-- CreateTable
CREATE TABLE "Novel" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetAudience" TEXT,
    "bookSellingPoint" TEXT,
    "competingFeel" TEXT,
    "first30ChapterPromise" TEXT,
    "commercialTagsJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "writingMode" TEXT NOT NULL DEFAULT 'original',
    "projectMode" "ProjectMode",
    "narrativePov" "NarrativePov",
    "pacePreference" "PacePreference",
    "styleTone" TEXT,
    "emotionIntensity" "EmotionIntensity",
    "aiFreedom" "AIFreedom",
    "defaultChapterLength" INTEGER,
    "estimatedChapterCount" INTEGER,
    "projectStatus" "ProjectProgressStatus" DEFAULT 'not_started',
    "storylineStatus" "ProjectProgressStatus" DEFAULT 'not_started',
    "outlineStatus" "ProjectProgressStatus" DEFAULT 'not_started',
    "resourceReadyScore" INTEGER,
    "sourceNovelId" TEXT,
    "sourceKnowledgeDocumentId" TEXT,
    "continuationBookAnalysisId" TEXT,
    "continuationBookAnalysisSections" TEXT,
    "outline" TEXT,
    "structuredOutline" TEXT,
    "storyWorldSliceJson" TEXT,
    "storyWorldSliceOverridesJson" TEXT,
    "storyWorldSliceSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "genreId" TEXT,
    "primaryStoryModeId" TEXT,
    "secondaryStoryModeId" TEXT,
    "worldId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Novel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeDecision" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "importance" TEXT NOT NULL DEFAULT 'normal',
    "expiresAt" INTEGER,
    "sourceType" TEXT,
    "sourceRefId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovelSnapshot" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "label" TEXT,
    "snapshotData" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NovelSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT DEFAULT '',
    "order" INTEGER NOT NULL,
    "generationState" "ChapterGenerationState" NOT NULL DEFAULT 'planned',
    "chapterStatus" "ChapterStatus" DEFAULT 'unplanned',
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "gender" "CharacterGender" NOT NULL DEFAULT 'unknown',
    "castRole" TEXT,
    "storyFunction" TEXT,
    "relationToProtagonist" TEXT,
    "personality" TEXT,
    "background" TEXT,
    "development" TEXT,
    "outerGoal" TEXT,
    "innerNeed" TEXT,
    "fear" TEXT,
    "wound" TEXT,
    "misbelief" TEXT,
    "secret" TEXT,
    "moralLine" TEXT,
    "firstImpression" TEXT,
    "arcStart" TEXT,
    "arcMidpoint" TEXT,
    "arcClimax" TEXT,
    "arcEnd" TEXT,
    "currentState" TEXT,
    "currentGoal" TEXT,
    "lastEvolvedAt" TIMESTAMP(3),
    "novelId" TEXT NOT NULL,
    "baseCharacterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterRelation" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "sourceCharacterId" TEXT NOT NULL,
    "targetCharacterId" TEXT NOT NULL,
    "surfaceRelation" TEXT NOT NULL,
    "hiddenTension" TEXT,
    "conflictSource" TEXT,
    "secretAsymmetry" TEXT,
    "dynamicLabel" TEXT,
    "nextTurnPoint" TEXT,
    "trustScore" INTEGER,
    "conflictScore" INTEGER,
    "intimacyScore" INTEGER,
    "dependencyScore" INTEGER,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterCastOption" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "whyItWorks" TEXT,
    "recommendedReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sourceStoryInput" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterCastOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterCastOptionMember" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "gender" "CharacterGender" NOT NULL DEFAULT 'unknown',
    "castRole" TEXT NOT NULL,
    "relationToProtagonist" TEXT,
    "storyFunction" TEXT NOT NULL,
    "shortDescription" TEXT,
    "outerGoal" TEXT,
    "innerNeed" TEXT,
    "fear" TEXT,
    "wound" TEXT,
    "misbelief" TEXT,
    "secret" TEXT,
    "moralLine" TEXT,
    "firstImpression" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterCastOptionMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterCastOptionRelation" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "sourceName" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "surfaceRelation" TEXT NOT NULL,
    "hiddenTension" TEXT,
    "conflictSource" TEXT,
    "secretAsymmetry" TEXT,
    "dynamicLabel" TEXT,
    "nextTurnPoint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterCastOptionRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterTimeline" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "chapterId" TEXT,
    "chapterOrder" INTEGER,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'auto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterCandidate" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "sourceChapterId" TEXT,
    "proposedName" TEXT NOT NULL,
    "proposedRole" TEXT,
    "summary" TEXT,
    "evidenceJson" TEXT,
    "matchedCharacterId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterVolumeAssignment" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "volumeId" TEXT NOT NULL,
    "roleLabel" TEXT,
    "responsibility" TEXT NOT NULL,
    "appearanceExpectation" TEXT,
    "plannedChapterOrdersJson" TEXT,
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "absenceWarningThreshold" INTEGER NOT NULL DEFAULT 3,
    "absenceHighRiskThreshold" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterVolumeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterFactionTrack" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "volumeId" TEXT,
    "chapterId" TEXT,
    "chapterOrder" INTEGER,
    "factionLabel" TEXT NOT NULL,
    "stanceLabel" TEXT,
    "summary" TEXT,
    "sourceType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterFactionTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterRelationStage" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "relationId" TEXT,
    "sourceCharacterId" TEXT NOT NULL,
    "targetCharacterId" TEXT NOT NULL,
    "volumeId" TEXT,
    "chapterId" TEXT,
    "chapterOrder" INTEGER,
    "stageLabel" TEXT NOT NULL,
    "stageSummary" TEXT NOT NULL,
    "nextTurnPoint" TEXT,
    "sourceType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterRelationStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaseCharacter" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaseCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageGenerationTask" (
    "id" TEXT NOT NULL,
    "sceneType" "ImageSceneType" NOT NULL DEFAULT 'character',
    "baseCharacterId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT,
    "stylePreset" TEXT,
    "size" TEXT NOT NULL DEFAULT '1024x1024',
    "imageCount" INTEGER NOT NULL DEFAULT 1,
    "seed" INTEGER,
    "status" "PipelineJobStatus" NOT NULL DEFAULT 'queued',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "heartbeatAt" TIMESTAMP(3),
    "currentStage" TEXT,
    "currentItemKey" TEXT,
    "currentItemLabel" TEXT,
    "cancelRequestedAt" TIMESTAMP(3),
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageGenerationTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageAsset" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "sceneType" "ImageSceneType" NOT NULL DEFAULT 'character',
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovelGenre" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "template" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelGenre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovelStoryMode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "template" TEXT,
    "profileJson" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelStoryMode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "World" (
    "id" TEXT NOT NULL,
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
    "structureJson" TEXT,
    "bindingSupportJson" TEXT,
    "structureSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "World_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldPropertyLibrary" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "worldType" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "sourceWorldId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldPropertyLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldSnapshot" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "label" TEXT,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorldSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldDeepeningQA" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'recommended',
    "question" TEXT NOT NULL,
    "targetLayer" TEXT,
    "targetField" TEXT,
    "answer" TEXT,
    "integratedSummary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldDeepeningQA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldConsistencyIssue" (
    "id" TEXT NOT NULL,
    "worldId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" TEXT,
    "source" TEXT NOT NULL DEFAULT 'rule',
    "status" TEXT NOT NULL DEFAULT 'open',
    "targetField" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldConsistencyIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WritingFormula" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WritingFormula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleProfile" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleTemplate" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AntiAiRule" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AntiAiRuleType" NOT NULL,
    "severity" "AntiAiSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "detectPatternsJson" TEXT,
    "rewriteSuggestion" TEXT,
    "promptInstruction" TEXT,
    "autoRewrite" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AntiAiRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleProfileAntiAiRule" (
    "id" TEXT NOT NULL,
    "styleProfileId" TEXT NOT NULL,
    "antiAiRuleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleProfileAntiAiRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleBinding" (
    "id" TEXT NOT NULL,
    "styleProfileId" TEXT NOT NULL,
    "targetType" "StyleBindingTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StyleBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TitleLibrary" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "clickRate" DOUBLE PRECISION,
    "keywords" TEXT,
    "genreId" TEXT,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TitleLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "APIKey" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "displayName" TEXT,
    "key" TEXT,
    "model" TEXT,
    "baseURL" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "reasoningEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "APIKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ModelRouteConfig" (
    "id" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "maxTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelRouteConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovelBible" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "coreSetting" TEXT,
    "forbiddenRules" TEXT,
    "mainPromise" TEXT,
    "characterArcs" TEXT,
    "worldRules" TEXT,
    "rawContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelBible_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlotBeat" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterOrder" INTEGER,
    "beatType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "BeatStatus" NOT NULL DEFAULT 'planned',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlotBeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterSummary" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keyEvents" TEXT,
    "characterStates" TEXT,
    "hook" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsistencyFact" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "category" "FactCategory" NOT NULL DEFAULT 'plot',
    "content" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsistencyFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "startOrder" INTEGER NOT NULL,
    "endOrder" INTEGER NOT NULL,
    "runMode" "PipelineRunMode" DEFAULT 'fast',
    "autoReview" BOOLEAN NOT NULL DEFAULT true,
    "autoRepair" BOOLEAN NOT NULL DEFAULT true,
    "skipCompleted" BOOLEAN NOT NULL DEFAULT true,
    "qualityThreshold" INTEGER,
    "repairMode" "PipelineRepairMode" DEFAULT 'light_repair',
    "status" "PipelineJobStatus" NOT NULL DEFAULT 'queued',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "heartbeatAt" TIMESTAMP(3),
    "currentStage" TEXT,
    "currentItemKey" TEXT,
    "currentItemLabel" TEXT,
    "cancelRequestedAt" TIMESTAMP(3),
    "error" TEXT,
    "lastErrorType" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "llmCallCount" INTEGER NOT NULL DEFAULT 0,
    "lastTokenRecordedAt" TIMESTAMP(3),
    "payload" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "novelId" TEXT,
    "chapterId" TEXT,
    "sessionId" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "entryAgent" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'queued',
    "currentStep" TEXT,
    "currentAgent" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "agentName" TEXT NOT NULL,
    "stepType" "AgentStepType" NOT NULL,
    "status" "AgentStepStatus" NOT NULL DEFAULT 'succeeded',
    "parentStepId" TEXT,
    "idempotencyKey" TEXT,
    "inputJson" TEXT,
    "outputJson" TEXT,
    "error" TEXT,
    "errorCode" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "tokenUsageJson" TEXT,
    "costUsd" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentApproval" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT,
    "approvalType" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "diffSummary" TEXT NOT NULL,
    "status" "AgentApprovalStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "decider" TEXT,
    "decidedAt" TIMESTAMP(3),
    "payloadJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeHubThread" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '新对话',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "status" "CreativeHubThreadStatus" NOT NULL DEFAULT 'idle',
    "latestRunId" TEXT,
    "latestError" TEXT,
    "resourceBindingsJson" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeHubThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeHubCheckpoint" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "parentCheckpointId" TEXT,
    "runId" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "preview" TEXT,
    "messagesJson" TEXT NOT NULL,
    "interruptsJson" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreativeHubCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorylineVersion" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "StorylineVersionStatus" NOT NULL DEFAULT 'draft',
    "content" TEXT NOT NULL,
    "diffSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorylineVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolumePlanVersion" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "VolumePlanVersionStatus" NOT NULL DEFAULT 'draft',
    "contentJson" TEXT NOT NULL,
    "diffSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolumePlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolumePlan" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "mainPromise" TEXT,
    "escalationMode" TEXT,
    "protagonistChange" TEXT,
    "climax" TEXT,
    "nextVolumeHook" TEXT,
    "resetPoint" TEXT,
    "openPayoffsJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sourceVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolumePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolumeChapterPlan" (
    "id" TEXT NOT NULL,
    "volumeId" TEXT NOT NULL,
    "chapterOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "purpose" TEXT,
    "conflictLevel" INTEGER,
    "revealLevel" INTEGER,
    "targetWordCount" INTEGER,
    "mustAvoid" TEXT,
    "taskSheet" TEXT,
    "payoffRefsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolumeChapterPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityReport" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "coherence" INTEGER NOT NULL,
    "repetition" INTEGER NOT NULL,
    "pacing" INTEGER NOT NULL,
    "voice" INTEGER NOT NULL,
    "engagement" INTEGER NOT NULL,
    "overall" INTEGER NOT NULL,
    "issues" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryMacroPlan" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "storyInput" TEXT,
    "expansionJson" TEXT,
    "decompositionJson" TEXT,
    "issuesJson" TEXT,
    "lockedFieldsJson" TEXT,
    "constraintEngineJson" TEXT,
    "stateJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryMacroPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookContract" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "readingPromise" TEXT NOT NULL,
    "protagonistFantasy" TEXT NOT NULL,
    "coreSellingPoint" TEXT NOT NULL,
    "chapter3Payoff" TEXT NOT NULL,
    "chapter10Payoff" TEXT NOT NULL,
    "chapter30Payoff" TEXT NOT NULL,
    "escalationLadder" TEXT NOT NULL,
    "relationshipMainline" TEXT NOT NULL,
    "absoluteRedLinesJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NovelWorkflowTask" (
    "id" TEXT NOT NULL,
    "novelId" TEXT,
    "lane" "NovelWorkflowLane" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "NovelWorkflowTaskStatus" NOT NULL DEFAULT 'queued',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentStage" TEXT,
    "currentItemKey" TEXT,
    "currentItemLabel" TEXT,
    "checkpointType" TEXT,
    "checkpointSummary" TEXT,
    "resumeTargetJson" TEXT,
    "seedPayloadJson" TEXT,
    "milestonesJson" TEXT,
    "heartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "llmCallCount" INTEGER NOT NULL DEFAULT 0,
    "lastTokenRecordedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NovelWorkflowTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryStateSnapshot" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "sourceChapterId" TEXT,
    "summary" TEXT,
    "rawStateJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryStateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterState" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "currentGoal" TEXT,
    "emotion" TEXT,
    "stressLevel" INTEGER,
    "secretExposure" TEXT,
    "knownFactsJson" TEXT,
    "misbeliefsJson" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CharacterState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelationState" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "sourceCharacterId" TEXT NOT NULL,
    "targetCharacterId" TEXT NOT NULL,
    "trustScore" INTEGER,
    "intimacyScore" INTEGER,
    "conflictScore" INTEGER,
    "dependencyScore" INTEGER,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelationState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InformationState" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "holderType" TEXT NOT NULL,
    "holderRefId" TEXT,
    "fact" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InformationState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForeshadowState" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" TEXT NOT NULL,
    "setupChapterId" TEXT,
    "payoffChapterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForeshadowState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenConflict" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "sourceSnapshotId" TEXT,
    "sourceIssueId" TEXT,
    "sourceType" TEXT NOT NULL,
    "conflictType" TEXT NOT NULL,
    "conflictKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "evidenceJson" TEXT,
    "affectedCharacterIdsJson" TEXT,
    "resolutionHint" TEXT,
    "lastSeenChapterOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenConflict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoffLedgerItem" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "ledgerKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "scopeType" "PayoffLedgerScopeType" NOT NULL,
    "currentStatus" "PayoffLedgerStatus" NOT NULL,
    "targetStartChapterOrder" INTEGER,
    "targetEndChapterOrder" INTEGER,
    "firstSeenChapterOrder" INTEGER,
    "lastTouchedChapterOrder" INTEGER,
    "lastTouchedChapterId" TEXT,
    "setupChapterId" TEXT,
    "payoffChapterId" TEXT,
    "lastSnapshotId" TEXT,
    "sourceRefsJson" TEXT,
    "evidenceJson" TEXT,
    "riskSignalsJson" TEXT,
    "statusReason" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoffLedgerItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryPlan" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "parentId" TEXT,
    "sourceStateSnapshotId" TEXT,
    "level" "StoryPlanLevel" NOT NULL,
    "planRole" "StoryPlanRole",
    "phaseLabel" TEXT,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "participantsJson" TEXT,
    "revealsJson" TEXT,
    "riskNotesJson" TEXT,
    "mustAdvanceJson" TEXT,
    "mustPreserveJson" TEXT,
    "sourceIssueIdsJson" TEXT,
    "replannedFromPlanId" TEXT,
    "hookTarget" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "externalRef" TEXT,
    "rawPlanJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChapterPlanScene" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "conflict" TEXT,
    "reveal" TEXT,
    "emotionBeat" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChapterPlanScene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplanRun" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "sourcePlanId" TEXT,
    "triggerType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "outputSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplanRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditReport" (
    "id" TEXT NOT NULL,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "auditType" "AuditType" NOT NULL,
    "overallScore" INTEGER,
    "summary" TEXT,
    "legacyScoreJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditIssue" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "auditType" "AuditType" NOT NULL,
    "severity" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "fixSuggestion" TEXT NOT NULL,
    "status" "AuditIssueStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "KnowledgeDocumentStatus" NOT NULL DEFAULT 'enabled',
    "activeVersionId" TEXT,
    "activeVersionNumber" INTEGER NOT NULL DEFAULT 0,
    "latestIndexStatus" "KnowledgeIndexStatus" NOT NULL DEFAULT 'idle',
    "lastIndexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBinding" (
    "id" TEXT NOT NULL,
    "targetType" "KnowledgeBindingTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookAnalysis" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "BookAnalysisStatus" NOT NULL DEFAULT 'queued',
    "summary" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "temperature" DOUBLE PRECISION,
    "maxTokens" INTEGER,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "heartbeatAt" TIMESTAMP(3),
    "currentStage" TEXT,
    "currentItemKey" TEXT,
    "currentItemLabel" TEXT,
    "cancelRequestedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "publishedDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookAnalysisSourceCache" (
    "id" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "notesMaxTokens" INTEGER NOT NULL,
    "segmentVersion" INTEGER NOT NULL DEFAULT 1,
    "segmentCount" INTEGER NOT NULL,
    "notesJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookAnalysisSourceCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookAnalysisSection" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "BookAnalysisSectionStatus" NOT NULL DEFAULT 'idle',
    "aiContent" TEXT,
    "editedContent" TEXT,
    "notes" TEXT,
    "structuredDataJson" TEXT,
    "evidenceJson" TEXT,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookAnalysisSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "ownerType" "RagOwnerType" NOT NULL,
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
    "indexedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RagIndexJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "jobType" "RagJobType" NOT NULL,
    "ownerType" "RagOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "RagJobStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadJson" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RagIndexJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCenterArchive" (
    "id" TEXT NOT NULL,
    "taskKind" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskCenterArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Novel_genreId_idx" ON "Novel"("genreId");

-- CreateIndex
CREATE INDEX "Novel_primaryStoryModeId_idx" ON "Novel"("primaryStoryModeId");

-- CreateIndex
CREATE INDEX "Novel_secondaryStoryModeId_idx" ON "Novel"("secondaryStoryModeId");

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
CREATE INDEX "CharacterRelation_novelId_updatedAt_idx" ON "CharacterRelation"("novelId", "updatedAt");

-- CreateIndex
CREATE INDEX "CharacterRelation_sourceCharacterId_idx" ON "CharacterRelation"("sourceCharacterId");

-- CreateIndex
CREATE INDEX "CharacterRelation_targetCharacterId_idx" ON "CharacterRelation"("targetCharacterId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterRelation_novelId_sourceCharacterId_targetCharacter_key" ON "CharacterRelation"("novelId", "sourceCharacterId", "targetCharacterId");

-- CreateIndex
CREATE INDEX "CharacterCastOption_novelId_updatedAt_idx" ON "CharacterCastOption"("novelId", "updatedAt");

-- CreateIndex
CREATE INDEX "CharacterCastOptionMember_optionId_sortOrder_idx" ON "CharacterCastOptionMember"("optionId", "sortOrder");

-- CreateIndex
CREATE INDEX "CharacterCastOptionRelation_optionId_sortOrder_idx" ON "CharacterCastOptionRelation"("optionId", "sortOrder");

-- CreateIndex
CREATE INDEX "CharacterTimeline_novelId_characterId_idx" ON "CharacterTimeline"("novelId", "characterId");

-- CreateIndex
CREATE INDEX "CharacterTimeline_characterId_chapterOrder_idx" ON "CharacterTimeline"("characterId", "chapterOrder");

-- CreateIndex
CREATE INDEX "CharacterTimeline_chapterId_idx" ON "CharacterTimeline"("chapterId");

-- CreateIndex
CREATE INDEX "CharacterCandidate_novelId_status_updatedAt_idx" ON "CharacterCandidate"("novelId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "CharacterCandidate_sourceChapterId_idx" ON "CharacterCandidate"("sourceChapterId");

-- CreateIndex
CREATE INDEX "CharacterCandidate_matchedCharacterId_idx" ON "CharacterCandidate"("matchedCharacterId");

-- CreateIndex
CREATE INDEX "CharacterVolumeAssignment_novelId_volumeId_isCore_idx" ON "CharacterVolumeAssignment"("novelId", "volumeId", "isCore");

-- CreateIndex
CREATE INDEX "CharacterVolumeAssignment_volumeId_characterId_idx" ON "CharacterVolumeAssignment"("volumeId", "characterId");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterVolumeAssignment_characterId_volumeId_key" ON "CharacterVolumeAssignment"("characterId", "volumeId");

-- CreateIndex
CREATE INDEX "CharacterFactionTrack_novelId_characterId_createdAt_idx" ON "CharacterFactionTrack"("novelId", "characterId", "createdAt");

-- CreateIndex
CREATE INDEX "CharacterFactionTrack_volumeId_characterId_createdAt_idx" ON "CharacterFactionTrack"("volumeId", "characterId", "createdAt");

-- CreateIndex
CREATE INDEX "CharacterFactionTrack_chapterId_createdAt_idx" ON "CharacterFactionTrack"("chapterId", "createdAt");

-- CreateIndex
CREATE INDEX "CharacterRelationStage_novelId_isCurrent_updatedAt_idx" ON "CharacterRelationStage"("novelId", "isCurrent", "updatedAt");

-- CreateIndex
CREATE INDEX "CharacterRelationStage_sourceCharacterId_targetCharacterId__idx" ON "CharacterRelationStage"("sourceCharacterId", "targetCharacterId", "isCurrent");

-- CreateIndex
CREATE INDEX "CharacterRelationStage_relationId_idx" ON "CharacterRelationStage"("relationId");

-- CreateIndex
CREATE INDEX "CharacterRelationStage_chapterId_idx" ON "CharacterRelationStage"("chapterId");

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
CREATE INDEX "NovelStoryMode_parentId_idx" ON "NovelStoryMode"("parentId");

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
CREATE INDEX "StyleProfile_status_updatedAt_idx" ON "StyleProfile"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "StyleProfile_sourceType_sourceRefId_idx" ON "StyleProfile"("sourceType", "sourceRefId");

-- CreateIndex
CREATE UNIQUE INDEX "StyleTemplate_key_key" ON "StyleTemplate"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AntiAiRule_key_key" ON "AntiAiRule"("key");

-- CreateIndex
CREATE INDEX "AntiAiRule_type_enabled_idx" ON "AntiAiRule"("type", "enabled");

-- CreateIndex
CREATE INDEX "StyleProfileAntiAiRule_antiAiRuleId_idx" ON "StyleProfileAntiAiRule"("antiAiRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "StyleProfileAntiAiRule_styleProfileId_antiAiRuleId_key" ON "StyleProfileAntiAiRule"("styleProfileId", "antiAiRuleId");

-- CreateIndex
CREATE INDEX "StyleBinding_targetType_targetId_enabled_idx" ON "StyleBinding"("targetType", "targetId", "enabled");

-- CreateIndex
CREATE INDEX "StyleBinding_styleProfileId_idx" ON "StyleBinding"("styleProfileId");

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
CREATE INDEX "VolumePlanVersion_novelId_status_createdAt_idx" ON "VolumePlanVersion"("novelId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VolumePlanVersion_novelId_version_key" ON "VolumePlanVersion"("novelId", "version");

-- CreateIndex
CREATE INDEX "VolumePlan_novelId_status_sortOrder_idx" ON "VolumePlan"("novelId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "VolumePlan_sourceVersionId_idx" ON "VolumePlan"("sourceVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "VolumePlan_novelId_sortOrder_key" ON "VolumePlan"("novelId", "sortOrder");

-- CreateIndex
CREATE INDEX "VolumeChapterPlan_volumeId_chapterOrder_idx" ON "VolumeChapterPlan"("volumeId", "chapterOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VolumeChapterPlan_volumeId_chapterOrder_key" ON "VolumeChapterPlan"("volumeId", "chapterOrder");

-- CreateIndex
CREATE INDEX "QualityReport_novelId_idx" ON "QualityReport"("novelId");

-- CreateIndex
CREATE INDEX "QualityReport_chapterId_idx" ON "QualityReport"("chapterId");

-- CreateIndex
CREATE INDEX "QualityReport_novelId_createdAt_idx" ON "QualityReport"("novelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoryMacroPlan_novelId_key" ON "StoryMacroPlan"("novelId");

-- CreateIndex
CREATE UNIQUE INDEX "BookContract_novelId_key" ON "BookContract"("novelId");

-- CreateIndex
CREATE INDEX "NovelWorkflowTask_novelId_status_updatedAt_idx" ON "NovelWorkflowTask"("novelId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "NovelWorkflowTask_status_updatedAt_idx" ON "NovelWorkflowTask"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "NovelWorkflowTask_lane_updatedAt_idx" ON "NovelWorkflowTask"("lane", "updatedAt");

-- CreateIndex
CREATE INDEX "StoryStateSnapshot_novelId_createdAt_idx" ON "StoryStateSnapshot"("novelId", "createdAt");

-- CreateIndex
CREATE INDEX "StoryStateSnapshot_sourceChapterId_idx" ON "StoryStateSnapshot"("sourceChapterId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryStateSnapshot_novelId_sourceChapterId_key" ON "StoryStateSnapshot"("novelId", "sourceChapterId");

-- CreateIndex
CREATE INDEX "CharacterState_characterId_createdAt_idx" ON "CharacterState"("characterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterState_snapshotId_characterId_key" ON "CharacterState"("snapshotId", "characterId");

-- CreateIndex
CREATE INDEX "RelationState_sourceCharacterId_targetCharacterId_idx" ON "RelationState"("sourceCharacterId", "targetCharacterId");

-- CreateIndex
CREATE UNIQUE INDEX "RelationState_snapshotId_sourceCharacterId_targetCharacterI_key" ON "RelationState"("snapshotId", "sourceCharacterId", "targetCharacterId");

-- CreateIndex
CREATE INDEX "InformationState_snapshotId_holderType_idx" ON "InformationState"("snapshotId", "holderType");

-- CreateIndex
CREATE INDEX "ForeshadowState_snapshotId_status_idx" ON "ForeshadowState"("snapshotId", "status");

-- CreateIndex
CREATE INDEX "ForeshadowState_setupChapterId_idx" ON "ForeshadowState"("setupChapterId");

-- CreateIndex
CREATE INDEX "ForeshadowState_payoffChapterId_idx" ON "ForeshadowState"("payoffChapterId");

-- CreateIndex
CREATE INDEX "OpenConflict_novelId_status_updatedAt_idx" ON "OpenConflict"("novelId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "OpenConflict_chapterId_status_idx" ON "OpenConflict"("chapterId", "status");

-- CreateIndex
CREATE INDEX "OpenConflict_sourceSnapshotId_idx" ON "OpenConflict"("sourceSnapshotId");

-- CreateIndex
CREATE INDEX "OpenConflict_sourceIssueId_idx" ON "OpenConflict"("sourceIssueId");

-- CreateIndex
CREATE UNIQUE INDEX "OpenConflict_novelId_chapterId_sourceType_conflictKey_key" ON "OpenConflict"("novelId", "chapterId", "sourceType", "conflictKey");

-- CreateIndex
CREATE INDEX "PayoffLedgerItem_novelId_currentStatus_updatedAt_idx" ON "PayoffLedgerItem"("novelId", "currentStatus", "updatedAt");

-- CreateIndex
CREATE INDEX "PayoffLedgerItem_novelId_targetEndChapterOrder_idx" ON "PayoffLedgerItem"("novelId", "targetEndChapterOrder");

-- CreateIndex
CREATE INDEX "PayoffLedgerItem_lastTouchedChapterId_idx" ON "PayoffLedgerItem"("lastTouchedChapterId");

-- CreateIndex
CREATE INDEX "PayoffLedgerItem_setupChapterId_idx" ON "PayoffLedgerItem"("setupChapterId");

-- CreateIndex
CREATE INDEX "PayoffLedgerItem_payoffChapterId_idx" ON "PayoffLedgerItem"("payoffChapterId");

-- CreateIndex
CREATE INDEX "PayoffLedgerItem_lastSnapshotId_idx" ON "PayoffLedgerItem"("lastSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoffLedgerItem_novelId_ledgerKey_key" ON "PayoffLedgerItem"("novelId", "ledgerKey");

-- CreateIndex
CREATE INDEX "StoryPlan_novelId_level_createdAt_idx" ON "StoryPlan"("novelId", "level", "createdAt");

-- CreateIndex
CREATE INDEX "StoryPlan_chapterId_createdAt_idx" ON "StoryPlan"("chapterId", "createdAt");

-- CreateIndex
CREATE INDEX "StoryPlan_externalRef_idx" ON "StoryPlan"("externalRef");

-- CreateIndex
CREATE INDEX "StoryPlan_sourceStateSnapshotId_idx" ON "StoryPlan"("sourceStateSnapshotId");

-- CreateIndex
CREATE INDEX "ChapterPlanScene_planId_sortOrder_idx" ON "ChapterPlanScene"("planId", "sortOrder");

-- CreateIndex
CREATE INDEX "ReplanRun_novelId_createdAt_idx" ON "ReplanRun"("novelId", "createdAt");

-- CreateIndex
CREATE INDEX "ReplanRun_chapterId_createdAt_idx" ON "ReplanRun"("chapterId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditReport_novelId_chapterId_auditType_createdAt_idx" ON "AuditReport"("novelId", "chapterId", "auditType", "createdAt");

-- CreateIndex
CREATE INDEX "AuditReport_chapterId_createdAt_idx" ON "AuditReport"("chapterId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditIssue_reportId_status_idx" ON "AuditIssue"("reportId", "status");

-- CreateIndex
CREATE INDEX "AuditIssue_auditType_severity_idx" ON "AuditIssue"("auditType", "severity");

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
CREATE INDEX "BookAnalysisSourceCache_documentVersionId_updatedAt_idx" ON "BookAnalysisSourceCache"("documentVersionId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookAnalysisSourceCache_documentVersionId_provider_model_te_key" ON "BookAnalysisSourceCache"("documentVersionId", "provider", "model", "temperature", "notesMaxTokens", "segmentVersion");

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

-- CreateIndex
CREATE INDEX "TaskCenterArchive_taskKind_archivedAt_idx" ON "TaskCenterArchive"("taskKind", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCenterArchive_taskKind_taskId_key" ON "TaskCenterArchive"("taskKind", "taskId");

-- AddForeignKey
ALTER TABLE "Novel" ADD CONSTRAINT "Novel_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "NovelGenre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novel" ADD CONSTRAINT "Novel_primaryStoryModeId_fkey" FOREIGN KEY ("primaryStoryModeId") REFERENCES "NovelStoryMode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novel" ADD CONSTRAINT "Novel_secondaryStoryModeId_fkey" FOREIGN KEY ("secondaryStoryModeId") REFERENCES "NovelStoryMode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novel" ADD CONSTRAINT "Novel_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novel" ADD CONSTRAINT "Novel_sourceNovelId_fkey" FOREIGN KEY ("sourceNovelId") REFERENCES "Novel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novel" ADD CONSTRAINT "Novel_sourceKnowledgeDocumentId_fkey" FOREIGN KEY ("sourceKnowledgeDocumentId") REFERENCES "KnowledgeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novel" ADD CONSTRAINT "Novel_continuationBookAnalysisId_fkey" FOREIGN KEY ("continuationBookAnalysisId") REFERENCES "BookAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeDecision" ADD CONSTRAINT "CreativeDecision_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NovelSnapshot" ADD CONSTRAINT "NovelSnapshot_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelation" ADD CONSTRAINT "CharacterRelation_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelation" ADD CONSTRAINT "CharacterRelation_sourceCharacterId_fkey" FOREIGN KEY ("sourceCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelation" ADD CONSTRAINT "CharacterRelation_targetCharacterId_fkey" FOREIGN KEY ("targetCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCastOption" ADD CONSTRAINT "CharacterCastOption_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCastOptionMember" ADD CONSTRAINT "CharacterCastOptionMember_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "CharacterCastOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCastOptionRelation" ADD CONSTRAINT "CharacterCastOptionRelation_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "CharacterCastOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterTimeline" ADD CONSTRAINT "CharacterTimeline_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterTimeline" ADD CONSTRAINT "CharacterTimeline_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterTimeline" ADD CONSTRAINT "CharacterTimeline_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCandidate" ADD CONSTRAINT "CharacterCandidate_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCandidate" ADD CONSTRAINT "CharacterCandidate_sourceChapterId_fkey" FOREIGN KEY ("sourceChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterCandidate" ADD CONSTRAINT "CharacterCandidate_matchedCharacterId_fkey" FOREIGN KEY ("matchedCharacterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterVolumeAssignment" ADD CONSTRAINT "CharacterVolumeAssignment_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterVolumeAssignment" ADD CONSTRAINT "CharacterVolumeAssignment_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterVolumeAssignment" ADD CONSTRAINT "CharacterVolumeAssignment_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "VolumePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterFactionTrack" ADD CONSTRAINT "CharacterFactionTrack_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterFactionTrack" ADD CONSTRAINT "CharacterFactionTrack_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterFactionTrack" ADD CONSTRAINT "CharacterFactionTrack_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "VolumePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterFactionTrack" ADD CONSTRAINT "CharacterFactionTrack_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationStage" ADD CONSTRAINT "CharacterRelationStage_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationStage" ADD CONSTRAINT "CharacterRelationStage_relationId_fkey" FOREIGN KEY ("relationId") REFERENCES "CharacterRelation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationStage" ADD CONSTRAINT "CharacterRelationStage_sourceCharacterId_fkey" FOREIGN KEY ("sourceCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationStage" ADD CONSTRAINT "CharacterRelationStage_targetCharacterId_fkey" FOREIGN KEY ("targetCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationStage" ADD CONSTRAINT "CharacterRelationStage_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "VolumePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterRelationStage" ADD CONSTRAINT "CharacterRelationStage_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenerationTask" ADD CONSTRAINT "ImageGenerationTask_baseCharacterId_fkey" FOREIGN KEY ("baseCharacterId") REFERENCES "BaseCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageAsset" ADD CONSTRAINT "ImageAsset_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ImageGenerationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageAsset" ADD CONSTRAINT "ImageAsset_baseCharacterId_fkey" FOREIGN KEY ("baseCharacterId") REFERENCES "BaseCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NovelGenre" ADD CONSTRAINT "NovelGenre_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NovelGenre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NovelStoryMode" ADD CONSTRAINT "NovelStoryMode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NovelStoryMode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldPropertyLibrary" ADD CONSTRAINT "WorldPropertyLibrary_sourceWorldId_fkey" FOREIGN KEY ("sourceWorldId") REFERENCES "World"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldSnapshot" ADD CONSTRAINT "WorldSnapshot_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldDeepeningQA" ADD CONSTRAINT "WorldDeepeningQA_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorldConsistencyIssue" ADD CONSTRAINT "WorldConsistencyIssue_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleProfileAntiAiRule" ADD CONSTRAINT "StyleProfileAntiAiRule_styleProfileId_fkey" FOREIGN KEY ("styleProfileId") REFERENCES "StyleProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleProfileAntiAiRule" ADD CONSTRAINT "StyleProfileAntiAiRule_antiAiRuleId_fkey" FOREIGN KEY ("antiAiRuleId") REFERENCES "AntiAiRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleBinding" ADD CONSTRAINT "StyleBinding_styleProfileId_fkey" FOREIGN KEY ("styleProfileId") REFERENCES "StyleProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NovelBible" ADD CONSTRAINT "NovelBible_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlotBeat" ADD CONSTRAINT "PlotBeat_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterSummary" ADD CONSTRAINT "ChapterSummary_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterSummary" ADD CONSTRAINT "ChapterSummary_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsistencyFact" ADD CONSTRAINT "ConsistencyFact_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsistencyFact" ADD CONSTRAINT "ConsistencyFact_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentStep" ADD CONSTRAINT "AgentStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentApproval" ADD CONSTRAINT "AgentApproval_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentApproval" ADD CONSTRAINT "AgentApproval_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "AgentStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeHubCheckpoint" ADD CONSTRAINT "CreativeHubCheckpoint_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "CreativeHubThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorylineVersion" ADD CONSTRAINT "StorylineVersion_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumePlanVersion" ADD CONSTRAINT "VolumePlanVersion_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumePlan" ADD CONSTRAINT "VolumePlan_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumePlan" ADD CONSTRAINT "VolumePlan_sourceVersionId_fkey" FOREIGN KEY ("sourceVersionId") REFERENCES "VolumePlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolumeChapterPlan" ADD CONSTRAINT "VolumeChapterPlan_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "VolumePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityReport" ADD CONSTRAINT "QualityReport_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityReport" ADD CONSTRAINT "QualityReport_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryMacroPlan" ADD CONSTRAINT "StoryMacroPlan_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookContract" ADD CONSTRAINT "BookContract_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NovelWorkflowTask" ADD CONSTRAINT "NovelWorkflowTask_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryStateSnapshot" ADD CONSTRAINT "StoryStateSnapshot_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryStateSnapshot" ADD CONSTRAINT "StoryStateSnapshot_sourceChapterId_fkey" FOREIGN KEY ("sourceChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterState" ADD CONSTRAINT "CharacterState_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "StoryStateSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterState" ADD CONSTRAINT "CharacterState_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationState" ADD CONSTRAINT "RelationState_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "StoryStateSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationState" ADD CONSTRAINT "RelationState_sourceCharacterId_fkey" FOREIGN KEY ("sourceCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationState" ADD CONSTRAINT "RelationState_targetCharacterId_fkey" FOREIGN KEY ("targetCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InformationState" ADD CONSTRAINT "InformationState_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "StoryStateSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForeshadowState" ADD CONSTRAINT "ForeshadowState_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "StoryStateSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForeshadowState" ADD CONSTRAINT "ForeshadowState_setupChapterId_fkey" FOREIGN KEY ("setupChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForeshadowState" ADD CONSTRAINT "ForeshadowState_payoffChapterId_fkey" FOREIGN KEY ("payoffChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenConflict" ADD CONSTRAINT "OpenConflict_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenConflict" ADD CONSTRAINT "OpenConflict_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenConflict" ADD CONSTRAINT "OpenConflict_sourceSnapshotId_fkey" FOREIGN KEY ("sourceSnapshotId") REFERENCES "StoryStateSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoffLedgerItem" ADD CONSTRAINT "PayoffLedgerItem_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoffLedgerItem" ADD CONSTRAINT "PayoffLedgerItem_lastTouchedChapterId_fkey" FOREIGN KEY ("lastTouchedChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoffLedgerItem" ADD CONSTRAINT "PayoffLedgerItem_setupChapterId_fkey" FOREIGN KEY ("setupChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoffLedgerItem" ADD CONSTRAINT "PayoffLedgerItem_payoffChapterId_fkey" FOREIGN KEY ("payoffChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoffLedgerItem" ADD CONSTRAINT "PayoffLedgerItem_lastSnapshotId_fkey" FOREIGN KEY ("lastSnapshotId") REFERENCES "StoryStateSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPlan" ADD CONSTRAINT "StoryPlan_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPlan" ADD CONSTRAINT "StoryPlan_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPlan" ADD CONSTRAINT "StoryPlan_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StoryPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryPlan" ADD CONSTRAINT "StoryPlan_sourceStateSnapshotId_fkey" FOREIGN KEY ("sourceStateSnapshotId") REFERENCES "StoryStateSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChapterPlanScene" ADD CONSTRAINT "ChapterPlanScene_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StoryPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplanRun" ADD CONSTRAINT "ReplanRun_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplanRun" ADD CONSTRAINT "ReplanRun_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplanRun" ADD CONSTRAINT "ReplanRun_sourcePlanId_fkey" FOREIGN KEY ("sourcePlanId") REFERENCES "StoryPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditReport" ADD CONSTRAINT "AuditReport_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditReport" ADD CONSTRAINT "AuditReport_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditIssue" ADD CONSTRAINT "AuditIssue_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "AuditReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDocument" ADD CONSTRAINT "KnowledgeDocument_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "KnowledgeDocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeDocumentVersion" ADD CONSTRAINT "KnowledgeDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBinding" ADD CONSTRAINT "KnowledgeBinding_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysis" ADD CONSTRAINT "BookAnalysis_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "KnowledgeDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysis" ADD CONSTRAINT "BookAnalysis_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "KnowledgeDocumentVersion"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysis" ADD CONSTRAINT "BookAnalysis_publishedDocumentId_fkey" FOREIGN KEY ("publishedDocumentId") REFERENCES "KnowledgeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysisSourceCache" ADD CONSTRAINT "BookAnalysisSourceCache_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "KnowledgeDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookAnalysisSection" ADD CONSTRAINT "BookAnalysisSection_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "BookAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

