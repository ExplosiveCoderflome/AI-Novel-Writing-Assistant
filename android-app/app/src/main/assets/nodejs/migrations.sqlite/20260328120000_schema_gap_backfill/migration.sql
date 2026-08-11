CREATE TABLE IF NOT EXISTS "CharacterRelation" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharacterRelation_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterRelation_sourceCharacterId_fkey" FOREIGN KEY ("sourceCharacterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterRelation_targetCharacterId_fkey" FOREIGN KEY ("targetCharacterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "CharacterCastOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "whyItWorks" TEXT,
    "recommendedReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sourceStoryInput" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharacterCastOption_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "CharacterCastOptionMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "optionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharacterCastOptionMember_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "CharacterCastOption" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "CharacterCastOptionRelation" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharacterCastOptionRelation_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "CharacterCastOption" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "CharacterCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "sourceChapterId" TEXT,
    "proposedName" TEXT NOT NULL,
    "proposedRole" TEXT,
    "summary" TEXT,
    "evidenceJson" TEXT,
    "matchedCharacterId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "confidence" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharacterCandidate_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterCandidate_sourceChapterId_fkey" FOREIGN KEY ("sourceChapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CharacterCandidate_matchedCharacterId_fkey" FOREIGN KEY ("matchedCharacterId") REFERENCES "Character" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "CharacterVolumeAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharacterVolumeAssignment_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterVolumeAssignment_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterVolumeAssignment_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "VolumePlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "CharacterFactionTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "volumeId" TEXT,
    "chapterId" TEXT,
    "chapterOrder" INTEGER,
    "factionLabel" TEXT NOT NULL,
    "stanceLabel" TEXT,
    "summary" TEXT,
    "sourceType" TEXT NOT NULL,
    "confidence" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharacterFactionTrack_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterFactionTrack_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterFactionTrack_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "VolumePlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CharacterFactionTrack_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "CharacterRelationStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "confidence" REAL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharacterRelationStage_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterRelationStage_relationId_fkey" FOREIGN KEY ("relationId") REFERENCES "CharacterRelation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CharacterRelationStage_sourceCharacterId_fkey" FOREIGN KEY ("sourceCharacterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterRelationStage_targetCharacterId_fkey" FOREIGN KEY ("targetCharacterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterRelationStage_volumeId_fkey" FOREIGN KEY ("volumeId") REFERENCES "VolumePlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CharacterRelationStage_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "StoryMacroPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "storyInput" TEXT,
    "expansionJson" TEXT,
    "decompositionJson" TEXT,
    "issuesJson" TEXT,
    "lockedFieldsJson" TEXT,
    "constraintEngineJson" TEXT,
    "stateJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoryMacroPlan_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "BookContract" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BookContract_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "NovelWorkflowTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT,
    "lane" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" REAL NOT NULL DEFAULT 0,
    "currentStage" TEXT,
    "currentItemKey" TEXT,
    "currentItemLabel" TEXT,
    "checkpointType" TEXT,
    "checkpointSummary" TEXT,
    "resumeTargetJson" TEXT,
    "seedPayloadJson" TEXT,
    "milestonesJson" TEXT,
    "pendingManualRecovery" BOOLEAN NOT NULL DEFAULT false,
    "heartbeatAt" DATETIME,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "cancelRequestedAt" DATETIME,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NovelWorkflowTask_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "StoryStateSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "sourceChapterId" TEXT,
    "summary" TEXT,
    "rawStateJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoryStateSnapshot_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoryStateSnapshot_sourceChapterId_fkey" FOREIGN KEY ("sourceChapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "CharacterState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "currentGoal" TEXT,
    "emotion" TEXT,
    "stressLevel" INTEGER,
    "secretExposure" TEXT,
    "knownFactsJson" TEXT,
    "misbeliefsJson" TEXT,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharacterState_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "StoryStateSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CharacterState_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "RelationState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "sourceCharacterId" TEXT NOT NULL,
    "targetCharacterId" TEXT NOT NULL,
    "trustScore" INTEGER,
    "intimacyScore" INTEGER,
    "conflictScore" INTEGER,
    "dependencyScore" INTEGER,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RelationState_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "StoryStateSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RelationState_sourceCharacterId_fkey" FOREIGN KEY ("sourceCharacterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RelationState_targetCharacterId_fkey" FOREIGN KEY ("targetCharacterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "InformationState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "holderType" TEXT NOT NULL,
    "holderRefId" TEXT,
    "fact" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InformationState_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "StoryStateSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ForeshadowState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" TEXT NOT NULL,
    "setupChapterId" TEXT,
    "payoffChapterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ForeshadowState_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "StoryStateSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ForeshadowState_setupChapterId_fkey" FOREIGN KEY ("setupChapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ForeshadowState_payoffChapterId_fkey" FOREIGN KEY ("payoffChapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "OpenConflict" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OpenConflict_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OpenConflict_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OpenConflict_sourceSnapshotId_fkey" FOREIGN KEY ("sourceSnapshotId") REFERENCES "StoryStateSnapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "StoryPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "parentId" TEXT,
    "sourceStateSnapshotId" TEXT,
    "level" TEXT NOT NULL,
    "planRole" TEXT,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StoryPlan_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StoryPlan_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StoryPlan_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StoryPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StoryPlan_sourceStateSnapshotId_fkey" FOREIGN KEY ("sourceStateSnapshotId") REFERENCES "StoryStateSnapshot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ChapterPlanScene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "conflict" TEXT,
    "reveal" TEXT,
    "emotionBeat" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ChapterPlanScene_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StoryPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ReplanRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT,
    "sourcePlanId" TEXT,
    "triggerType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "outputSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReplanRun_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReplanRun_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReplanRun_sourcePlanId_fkey" FOREIGN KEY ("sourcePlanId") REFERENCES "StoryPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AuditReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novelId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "auditType" TEXT NOT NULL,
    "overallScore" INTEGER,
    "summary" TEXT,
    "legacyScoreJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuditReport_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditReport_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AuditIssue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "auditType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "fixSuggestion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AuditIssue_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "AuditReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "CharacterRelation_novelId_updatedAt_idx" ON "CharacterRelation"("novelId", "updatedAt");
CREATE INDEX IF NOT EXISTS "CharacterRelation_sourceCharacterId_idx" ON "CharacterRelation"("sourceCharacterId");
CREATE INDEX IF NOT EXISTS "CharacterRelation_targetCharacterId_idx" ON "CharacterRelation"("targetCharacterId");
CREATE UNIQUE INDEX IF NOT EXISTS "CharacterRelation_novelId_sourceCharacterId_targetCharacterId_key" ON "CharacterRelation"("novelId", "sourceCharacterId", "targetCharacterId");

CREATE INDEX IF NOT EXISTS "CharacterCastOption_novelId_updatedAt_idx" ON "CharacterCastOption"("novelId", "updatedAt");
CREATE INDEX IF NOT EXISTS "CharacterCastOptionMember_optionId_sortOrder_idx" ON "CharacterCastOptionMember"("optionId", "sortOrder");
CREATE INDEX IF NOT EXISTS "CharacterCastOptionRelation_optionId_sortOrder_idx" ON "CharacterCastOptionRelation"("optionId", "sortOrder");

CREATE INDEX IF NOT EXISTS "CharacterCandidate_novelId_status_updatedAt_idx" ON "CharacterCandidate"("novelId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "CharacterCandidate_sourceChapterId_idx" ON "CharacterCandidate"("sourceChapterId");
CREATE INDEX IF NOT EXISTS "CharacterCandidate_matchedCharacterId_idx" ON "CharacterCandidate"("matchedCharacterId");

CREATE INDEX IF NOT EXISTS "CharacterVolumeAssignment_novelId_volumeId_isCore_idx" ON "CharacterVolumeAssignment"("novelId", "volumeId", "isCore");
CREATE INDEX IF NOT EXISTS "CharacterVolumeAssignment_volumeId_characterId_idx" ON "CharacterVolumeAssignment"("volumeId", "characterId");
CREATE UNIQUE INDEX IF NOT EXISTS "CharacterVolumeAssignment_characterId_volumeId_key" ON "CharacterVolumeAssignment"("characterId", "volumeId");

CREATE INDEX IF NOT EXISTS "CharacterFactionTrack_novelId_characterId_createdAt_idx" ON "CharacterFactionTrack"("novelId", "characterId", "createdAt");
CREATE INDEX IF NOT EXISTS "CharacterFactionTrack_volumeId_characterId_createdAt_idx" ON "CharacterFactionTrack"("volumeId", "characterId", "createdAt");
CREATE INDEX IF NOT EXISTS "CharacterFactionTrack_chapterId_createdAt_idx" ON "CharacterFactionTrack"("chapterId", "createdAt");

CREATE INDEX IF NOT EXISTS "CharacterRelationStage_novelId_isCurrent_updatedAt_idx" ON "CharacterRelationStage"("novelId", "isCurrent", "updatedAt");
CREATE INDEX IF NOT EXISTS "CharacterRelationStage_sourceCharacterId_targetCharacterId_isCurrent_idx" ON "CharacterRelationStage"("sourceCharacterId", "targetCharacterId", "isCurrent");
CREATE INDEX IF NOT EXISTS "CharacterRelationStage_relationId_idx" ON "CharacterRelationStage"("relationId");
CREATE INDEX IF NOT EXISTS "CharacterRelationStage_chapterId_idx" ON "CharacterRelationStage"("chapterId");

CREATE UNIQUE INDEX IF NOT EXISTS "StoryMacroPlan_novelId_key" ON "StoryMacroPlan"("novelId");
CREATE UNIQUE INDEX IF NOT EXISTS "BookContract_novelId_key" ON "BookContract"("novelId");

CREATE INDEX IF NOT EXISTS "NovelWorkflowTask_novelId_status_updatedAt_idx" ON "NovelWorkflowTask"("novelId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "NovelWorkflowTask_status_updatedAt_idx" ON "NovelWorkflowTask"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "NovelWorkflowTask_lane_updatedAt_idx" ON "NovelWorkflowTask"("lane", "updatedAt");

CREATE INDEX IF NOT EXISTS "StoryStateSnapshot_novelId_createdAt_idx" ON "StoryStateSnapshot"("novelId", "createdAt");
CREATE INDEX IF NOT EXISTS "StoryStateSnapshot_sourceChapterId_idx" ON "StoryStateSnapshot"("sourceChapterId");
CREATE UNIQUE INDEX IF NOT EXISTS "StoryStateSnapshot_novelId_sourceChapterId_key" ON "StoryStateSnapshot"("novelId", "sourceChapterId");

CREATE INDEX IF NOT EXISTS "CharacterState_characterId_createdAt_idx" ON "CharacterState"("characterId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "CharacterState_snapshotId_characterId_key" ON "CharacterState"("snapshotId", "characterId");

CREATE INDEX IF NOT EXISTS "RelationState_sourceCharacterId_targetCharacterId_idx" ON "RelationState"("sourceCharacterId", "targetCharacterId");
CREATE UNIQUE INDEX IF NOT EXISTS "RelationState_snapshotId_sourceCharacterId_targetCharacterId_key" ON "RelationState"("snapshotId", "sourceCharacterId", "targetCharacterId");

CREATE INDEX IF NOT EXISTS "InformationState_snapshotId_holderType_idx" ON "InformationState"("snapshotId", "holderType");

CREATE INDEX IF NOT EXISTS "ForeshadowState_snapshotId_status_idx" ON "ForeshadowState"("snapshotId", "status");
CREATE INDEX IF NOT EXISTS "ForeshadowState_setupChapterId_idx" ON "ForeshadowState"("setupChapterId");
CREATE INDEX IF NOT EXISTS "ForeshadowState_payoffChapterId_idx" ON "ForeshadowState"("payoffChapterId");

CREATE INDEX IF NOT EXISTS "OpenConflict_novelId_status_updatedAt_idx" ON "OpenConflict"("novelId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "OpenConflict_chapterId_status_idx" ON "OpenConflict"("chapterId", "status");
CREATE INDEX IF NOT EXISTS "OpenConflict_sourceSnapshotId_idx" ON "OpenConflict"("sourceSnapshotId");
CREATE INDEX IF NOT EXISTS "OpenConflict_sourceIssueId_idx" ON "OpenConflict"("sourceIssueId");
CREATE UNIQUE INDEX IF NOT EXISTS "OpenConflict_novelId_chapterId_sourceType_conflictKey_key" ON "OpenConflict"("novelId", "chapterId", "sourceType", "conflictKey");

CREATE INDEX IF NOT EXISTS "StoryPlan_novelId_level_createdAt_idx" ON "StoryPlan"("novelId", "level", "createdAt");
CREATE INDEX IF NOT EXISTS "StoryPlan_chapterId_createdAt_idx" ON "StoryPlan"("chapterId", "createdAt");
CREATE INDEX IF NOT EXISTS "StoryPlan_externalRef_idx" ON "StoryPlan"("externalRef");
CREATE INDEX IF NOT EXISTS "StoryPlan_sourceStateSnapshotId_idx" ON "StoryPlan"("sourceStateSnapshotId");

CREATE INDEX IF NOT EXISTS "ChapterPlanScene_planId_sortOrder_idx" ON "ChapterPlanScene"("planId", "sortOrder");

CREATE INDEX IF NOT EXISTS "ReplanRun_novelId_createdAt_idx" ON "ReplanRun"("novelId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReplanRun_chapterId_createdAt_idx" ON "ReplanRun"("chapterId", "createdAt");

CREATE INDEX IF NOT EXISTS "AuditReport_novelId_chapterId_auditType_createdAt_idx" ON "AuditReport"("novelId", "chapterId", "auditType", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditReport_chapterId_createdAt_idx" ON "AuditReport"("chapterId", "createdAt");

CREATE INDEX IF NOT EXISTS "AuditIssue_reportId_status_idx" ON "AuditIssue"("reportId", "status");
CREATE INDEX IF NOT EXISTS "AuditIssue_auditType_severity_idx" ON "AuditIssue"("auditType", "severity");
