CREATE TABLE IF NOT EXISTS "DramaProject" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'original',
    "sourceRef" TEXT,
    "sourceInput" TEXT,
    "track" TEXT,
    "theme" TEXT,
    "orientation" TEXT NOT NULL DEFAULT 'vertical_paid',
    "targetEpisodes" INTEGER NOT NULL DEFAULT 80,
    "strategy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DramaProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DramaSourceBundle" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "synopsis" TEXT,
    "beats" TEXT,
    "worldNotes" TEXT,
    "hardFacts" TEXT,
    "rawText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DramaSourceBundle_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DramaSourceBundle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DramaProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "DramaCharacter" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archetype" TEXT,
    "persona" TEXT,
    "speechStyle" TEXT,
    "visualAnchor" TEXT,
    "voiceProfile" TEXT,
    "relations" TEXT,
    "sourceCharacterRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DramaCharacter_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DramaCharacter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DramaProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "DramaEpisode" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT DEFAULT '',
    "hookOpening" TEXT,
    "cliffhanger" TEXT,
    "hookType" TEXT,
    "isPaywall" BOOLEAN NOT NULL DEFAULT false,
    "emotionNet" INTEGER,
    "beatSheet" TEXT,
    "sourceMap" TEXT,
    "durationSec" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "qualityFlags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DramaEpisode_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DramaEpisode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DramaProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "DramaFact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "episodeOrder" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'completed',
    "source" TEXT NOT NULL DEFAULT 'auto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DramaFact_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DramaFact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DramaProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "DramaCharacterLibrary" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "archetype" TEXT,
    "persona" TEXT,
    "speechStyle" TEXT,
    "visualAnchor" TEXT,
    "voiceProfile" TEXT,
    "relations" TEXT,
    "tags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DramaCharacterLibrary_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DramaCharacterLibrary_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DramaProject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "DramaStoryboard" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DramaStoryboard_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DramaStoryboard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DramaProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DramaStoryboard_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "DramaEpisode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "DramaShot" (
    "id" TEXT NOT NULL,
    "storyboardId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "shotSize" TEXT,
    "cameraMove" TEXT,
    "durationSec" INTEGER,
    "location" TEXT,
    "action" TEXT NOT NULL,
    "dialogue" TEXT,
    "characterRefs" TEXT,
    "visualPrompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DramaShot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DramaShot_storyboardId_fkey" FOREIGN KEY ("storyboardId") REFERENCES "DramaStoryboard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "DramaVideoPrompt" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "episodeId" TEXT,
    "shotId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT,
    "aspectRatio" TEXT NOT NULL DEFAULT '9:16',
    "durationSec" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'prompted',
    "providerTaskId" TEXT,
    "providerResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DramaVideoPrompt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DramaVideoPrompt_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DramaProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DramaVideoPrompt_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "DramaEpisode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "DramaSourceBundle_projectId_key" ON "DramaSourceBundle"("projectId");
CREATE INDEX IF NOT EXISTS "DramaProject_source_idx" ON "DramaProject"("source");
CREATE INDEX IF NOT EXISTS "DramaProject_status_idx" ON "DramaProject"("status");
CREATE INDEX IF NOT EXISTS "DramaCharacter_projectId_idx" ON "DramaCharacter"("projectId");
CREATE UNIQUE INDEX IF NOT EXISTS "DramaEpisode_projectId_order_key" ON "DramaEpisode"("projectId", "order");
CREATE INDEX IF NOT EXISTS "DramaEpisode_projectId_status_idx" ON "DramaEpisode"("projectId", "status");
CREATE INDEX IF NOT EXISTS "DramaFact_projectId_episodeOrder_idx" ON "DramaFact"("projectId", "episodeOrder");
CREATE INDEX IF NOT EXISTS "DramaFact_projectId_category_idx" ON "DramaFact"("projectId", "category");
CREATE INDEX IF NOT EXISTS "DramaCharacterLibrary_projectId_idx" ON "DramaCharacterLibrary"("projectId");
CREATE INDEX IF NOT EXISTS "DramaCharacterLibrary_name_idx" ON "DramaCharacterLibrary"("name");
CREATE INDEX IF NOT EXISTS "DramaStoryboard_projectId_idx" ON "DramaStoryboard"("projectId");
CREATE INDEX IF NOT EXISTS "DramaStoryboard_episodeId_idx" ON "DramaStoryboard"("episodeId");
CREATE UNIQUE INDEX IF NOT EXISTS "DramaShot_storyboardId_order_key" ON "DramaShot"("storyboardId", "order");
CREATE INDEX IF NOT EXISTS "DramaShot_storyboardId_idx" ON "DramaShot"("storyboardId");
CREATE INDEX IF NOT EXISTS "DramaVideoPrompt_projectId_idx" ON "DramaVideoPrompt"("projectId");
CREATE INDEX IF NOT EXISTS "DramaVideoPrompt_episodeId_idx" ON "DramaVideoPrompt"("episodeId");
CREATE INDEX IF NOT EXISTS "DramaVideoPrompt_provider_status_idx" ON "DramaVideoPrompt"("provider", "status");
