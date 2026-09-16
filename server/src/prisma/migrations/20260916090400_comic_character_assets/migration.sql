CREATE TABLE IF NOT EXISTS "ComicCharacterAsset" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageData" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComicCharacterAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ComicCharacterAsset_characterId_idx" ON "ComicCharacterAsset"("characterId");
CREATE INDEX IF NOT EXISTS "ComicCharacterAsset_projectId_idx" ON "ComicCharacterAsset"("projectId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ComicCharacterAsset_characterId_fkey'
          AND conrelid = '"ComicCharacterAsset"'::regclass
    ) THEN
        ALTER TABLE "ComicCharacterAsset" ADD CONSTRAINT "ComicCharacterAsset_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "ComicCharacter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ComicCharacterAsset_projectId_fkey'
          AND conrelid = '"ComicCharacterAsset"'::regclass
    ) THEN
        ALTER TABLE "ComicCharacterAsset" ADD CONSTRAINT "ComicCharacterAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
