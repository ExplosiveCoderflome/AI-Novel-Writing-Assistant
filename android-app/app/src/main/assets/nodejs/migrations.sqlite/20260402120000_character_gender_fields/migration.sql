ALTER TABLE "Character" ADD COLUMN "gender" TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE "CharacterCastOptionMember" ADD COLUMN "gender" TEXT NOT NULL DEFAULT 'unknown';
