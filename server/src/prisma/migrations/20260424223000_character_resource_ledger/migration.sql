CREATE TABLE IF NOT EXISTS "CharacterResourceLedgerItem" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "resourceKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "narrativeFunction" TEXT NOT NULL,
  "ownerType" TEXT NOT NULL,
  "ownerId" TEXT,
  "ownerName" TEXT,
  "ownerCharacterId" TEXT,
  "holderCharacterId" TEXT,
  "holderCharacterName" TEXT,
  "status" TEXT NOT NULL,
  "readerKnows" BOOLEAN NOT NULL DEFAULT false,
  "holderKnows" BOOLEAN NOT NULL DEFAULT true,
  "knownByCharacterIdsJson" TEXT,
  "introducedChapterId" TEXT,
  "introducedChapterOrder" INTEGER,
  "lastTouchedChapterId" TEXT,
  "lastTouchedChapterOrder" INTEGER,
  "expectedUseStartChapterOrder" INTEGER,
  "expectedUseEndChapterOrder" INTEGER,
  "constraintsJson" TEXT,
  "riskSignalsJson" TEXT,
  "sourceRefsJson" TEXT,
  "evidenceJson" TEXT,
  "confidence" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CharacterResourceLedgerItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CharacterResourceEvent" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "chapterId" TEXT,
  "chapterOrder" INTEGER,
  "eventType" TEXT NOT NULL,
  "actorCharacterId" TEXT,
  "fromHolderCharacterId" TEXT,
  "toHolderCharacterId" TEXT,
  "summary" TEXT NOT NULL,
  "evidenceJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CharacterResourceEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CharacterResourceLedgerItem_novelId_resourceKey_key" ON "CharacterResourceLedgerItem"("novelId", "resourceKey");
CREATE INDEX IF NOT EXISTS "CharacterResourceLedgerItem_novelId_status_updatedAt_idx" ON "CharacterResourceLedgerItem"("novelId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "CharacterResourceLedgerItem_holderCharacterId_status_idx" ON "CharacterResourceLedgerItem"("holderCharacterId", "status");
CREATE INDEX IF NOT EXISTS "CharacterResourceLedgerItem_ownerCharacterId_idx" ON "CharacterResourceLedgerItem"("ownerCharacterId");
CREATE INDEX IF NOT EXISTS "CharacterResourceLedgerItem_novelId_lastTouchedChapterOrder_idx" ON "CharacterResourceLedgerItem"("novelId", "lastTouchedChapterOrder");
CREATE INDEX IF NOT EXISTS "CharacterResourceLedgerItem_introducedChapterId_idx" ON "CharacterResourceLedgerItem"("introducedChapterId");
CREATE INDEX IF NOT EXISTS "CharacterResourceLedgerItem_lastTouchedChapterId_idx" ON "CharacterResourceLedgerItem"("lastTouchedChapterId");
CREATE INDEX IF NOT EXISTS "CharacterResourceEvent_novelId_createdAt_idx" ON "CharacterResourceEvent"("novelId", "createdAt");
CREATE INDEX IF NOT EXISTS "CharacterResourceEvent_resourceId_createdAt_idx" ON "CharacterResourceEvent"("resourceId", "createdAt");
CREATE INDEX IF NOT EXISTS "CharacterResourceEvent_chapterId_idx" ON "CharacterResourceEvent"("chapterId");
CREATE INDEX IF NOT EXISTS "CharacterResourceEvent_actorCharacterId_idx" ON "CharacterResourceEvent"("actorCharacterId");
CREATE INDEX IF NOT EXISTS "CharacterResourceEvent_fromHolderCharacterId_idx" ON "CharacterResourceEvent"("fromHolderCharacterId");
CREATE INDEX IF NOT EXISTS "CharacterResourceEvent_toHolderCharacterId_idx" ON "CharacterResourceEvent"("toHolderCharacterId");

DO $$ BEGIN
  ALTER TABLE "CharacterResourceLedgerItem" ADD CONSTRAINT "CharacterResourceLedgerItem_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CharacterResourceLedgerItem" ADD CONSTRAINT "CharacterResourceLedgerItem_ownerCharacterId_fkey" FOREIGN KEY ("ownerCharacterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CharacterResourceLedgerItem" ADD CONSTRAINT "CharacterResourceLedgerItem_holderCharacterId_fkey" FOREIGN KEY ("holderCharacterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CharacterResourceLedgerItem" ADD CONSTRAINT "CharacterResourceLedgerItem_introducedChapterId_fkey" FOREIGN KEY ("introducedChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CharacterResourceLedgerItem" ADD CONSTRAINT "CharacterResourceLedgerItem_lastTouchedChapterId_fkey" FOREIGN KEY ("lastTouchedChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CharacterResourceEvent" ADD CONSTRAINT "CharacterResourceEvent_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CharacterResourceEvent" ADD CONSTRAINT "CharacterResourceEvent_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "CharacterResourceLedgerItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CharacterResourceEvent" ADD CONSTRAINT "CharacterResourceEvent_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CharacterResourceEvent" ADD CONSTRAINT "CharacterResourceEvent_actorCharacterId_fkey" FOREIGN KEY ("actorCharacterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CharacterResourceEvent" ADD CONSTRAINT "CharacterResourceEvent_fromHolderCharacterId_fkey" FOREIGN KEY ("fromHolderCharacterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CharacterResourceEvent" ADD CONSTRAINT "CharacterResourceEvent_toHolderCharacterId_fkey" FOREIGN KEY ("toHolderCharacterId") REFERENCES "Character"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
