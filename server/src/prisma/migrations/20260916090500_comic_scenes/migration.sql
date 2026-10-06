CREATE TABLE IF NOT EXISTS "ComicScene" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sceneType" TEXT NOT NULL DEFAULT 'interior',
    "bible" TEXT,
    "sheetData" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComicScene_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ComicScene_projectId_idx" ON "ComicScene"("projectId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ComicScene_projectId_fkey'
          AND conrelid = '"ComicScene"'::regclass
    ) THEN
        ALTER TABLE "ComicScene" ADD CONSTRAINT "ComicScene_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
