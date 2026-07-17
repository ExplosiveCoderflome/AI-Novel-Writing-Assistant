-- Non-canonical, evidence-backed character mind snapshots.
CREATE TABLE "CharacterMindSnapshot" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "sourceChapterId" TEXT,
  "sourceType" TEXT NOT NULL,
  "currentInterpretation" TEXT NOT NULL,
  "privateIntent" TEXT,
  "activePlan" TEXT,
  "emotionalStance" TEXT,
  "actionTendency" TEXT,
  "decisionTrigger" TEXT,
  "beliefsJson" TEXT NOT NULL DEFAULT '[]',
  "misbeliefsJson" TEXT NOT NULL DEFAULT '[]',
  "evidenceJson" TEXT NOT NULL DEFAULT '[]',
  "confidence" REAL,
  "isCurrent" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CharacterMindSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CharacterMindSnapshot_novelId_characterId_isCurrent_updatedAt_idx"
  ON "CharacterMindSnapshot"("novelId", "characterId", "isCurrent", "updatedAt");
CREATE INDEX "CharacterMindSnapshot_sourceChapterId_idx" ON "CharacterMindSnapshot"("sourceChapterId");

ALTER TABLE "CharacterMindSnapshot" ADD CONSTRAINT "CharacterMindSnapshot_novelId_fkey"
  FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterMindSnapshot" ADD CONSTRAINT "CharacterMindSnapshot_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CharacterMindSnapshot" ADD CONSTRAINT "CharacterMindSnapshot_sourceChapterId_fkey"
  FOREIGN KEY ("sourceChapterId") REFERENCES "Chapter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
