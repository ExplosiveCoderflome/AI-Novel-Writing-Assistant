CREATE TABLE IF NOT EXISTS "BaseCharacterRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "baseCharacterId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshotJson" TEXT NOT NULL,
  "changeSummary" TEXT,
  "sourceType" TEXT NOT NULL DEFAULT 'manual',
  "sourceRefId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BaseCharacterRevision_baseCharacterId_fkey" FOREIGN KEY ("baseCharacterId") REFERENCES "BaseCharacter" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "CharacterLibraryLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "baseCharacterId" TEXT NOT NULL,
  "baseRevisionId" TEXT,
  "syncPolicy" TEXT NOT NULL DEFAULT 'manual_review',
  "linkStatus" TEXT NOT NULL DEFAULT 'linked',
  "localOverridesJson" TEXT,
  "lastSyncedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CharacterLibraryLink_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CharacterLibraryLink_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CharacterLibraryLink_baseCharacterId_fkey" FOREIGN KEY ("baseCharacterId") REFERENCES "BaseCharacter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CharacterLibraryLink_baseRevisionId_fkey" FOREIGN KEY ("baseRevisionId") REFERENCES "BaseCharacterRevision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "CharacterSyncProposal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT,
  "characterId" TEXT,
  "baseCharacterId" TEXT,
  "baseRevisionId" TEXT,
  "direction" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending_review',
  "confidence" REAL,
  "summary" TEXT NOT NULL,
  "payloadJson" TEXT NOT NULL,
  "safeUpdatesJson" TEXT,
  "novelOnlyUpdatesJson" TEXT,
  "riskyUpdatesJson" TEXT,
  "recommendedAction" TEXT,
  "sourceType" TEXT NOT NULL DEFAULT 'manual',
  "sourceRefId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CharacterSyncProposal_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CharacterSyncProposal_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CharacterSyncProposal_baseCharacterId_fkey" FOREIGN KEY ("baseCharacterId") REFERENCES "BaseCharacter" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CharacterSyncProposal_baseRevisionId_fkey" FOREIGN KEY ("baseRevisionId") REFERENCES "BaseCharacterRevision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "BaseCharacterRevision_baseCharacterId_version_key" ON "BaseCharacterRevision"("baseCharacterId", "version");
CREATE INDEX IF NOT EXISTS "BaseCharacterRevision_baseCharacterId_createdAt_idx" ON "BaseCharacterRevision"("baseCharacterId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "CharacterLibraryLink_characterId_key" ON "CharacterLibraryLink"("characterId");
CREATE INDEX IF NOT EXISTS "CharacterLibraryLink_novelId_linkStatus_updatedAt_idx" ON "CharacterLibraryLink"("novelId", "linkStatus", "updatedAt");
CREATE INDEX IF NOT EXISTS "CharacterLibraryLink_baseCharacterId_linkStatus_updatedAt_idx" ON "CharacterLibraryLink"("baseCharacterId", "linkStatus", "updatedAt");
CREATE INDEX IF NOT EXISTS "CharacterLibraryLink_baseRevisionId_idx" ON "CharacterLibraryLink"("baseRevisionId");
CREATE INDEX IF NOT EXISTS "CharacterSyncProposal_novelId_status_updatedAt_idx" ON "CharacterSyncProposal"("novelId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "CharacterSyncProposal_characterId_status_updatedAt_idx" ON "CharacterSyncProposal"("characterId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "CharacterSyncProposal_baseCharacterId_status_updatedAt_idx" ON "CharacterSyncProposal"("baseCharacterId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "CharacterSyncProposal_baseRevisionId_idx" ON "CharacterSyncProposal"("baseRevisionId");
