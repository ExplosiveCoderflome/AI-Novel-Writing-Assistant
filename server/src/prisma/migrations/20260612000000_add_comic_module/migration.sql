-- CreateTable: Comic 模块（AI 漫画）
-- 低耦合：对 Novel 零外键，sourceRef 软引用，保证可拆分

CREATE TABLE "ComicProject" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'original',
    "sourceRef" TEXT,
    "sourceInput" TEXT,
    "trackId" TEXT,
    "stylePreset" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComicProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComicSourceBundle" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "bundleJson" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComicSourceBundle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComicCharacter" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "persona" TEXT,
    "visualAnchor" TEXT,
    "sheetData" TEXT,
    "sourceCharacterRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComicCharacter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComicEpisode" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT,
    "hookType" TEXT,
    "cliffhanger" TEXT,
    "isPaywalled" BOOLEAN NOT NULL DEFAULT false,
    "outline" TEXT,
    "sourceText" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComicEpisode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComicPanel" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "panelType" TEXT,
    "action" TEXT NOT NULL,
    "dialogues" TEXT,
    "characterRefs" TEXT,
    "visualPrompt" TEXT,
    "imageData" TEXT,
    "letteredData" TEXT,
    "motionData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComicPanel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComicFact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'completed',
    "episodeOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComicFact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComicUploadAsset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "refId" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComicUploadAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComicExportJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "episodeId" TEXT,
    "format" TEXT NOT NULL,
    "spec" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "artifacts" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComicExportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ComicBatchJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "episodeId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComicBatchJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComicSourceBundle_projectId_key" ON "ComicSourceBundle"("projectId");
CREATE INDEX "ComicProject_sourceType_idx" ON "ComicProject"("sourceType");
CREATE INDEX "ComicProject_status_idx" ON "ComicProject"("status");
CREATE INDEX "ComicCharacter_projectId_idx" ON "ComicCharacter"("projectId");
CREATE UNIQUE INDEX "ComicEpisode_projectId_order_key" ON "ComicEpisode"("projectId", "order");
CREATE INDEX "ComicEpisode_projectId_status_idx" ON "ComicEpisode"("projectId", "status");
CREATE UNIQUE INDEX "ComicPanel_episodeId_order_key" ON "ComicPanel"("episodeId", "order");
CREATE INDEX "ComicPanel_episodeId_idx" ON "ComicPanel"("episodeId");
CREATE INDEX "ComicFact_projectId_idx" ON "ComicFact"("projectId");
CREATE INDEX "ComicUploadAsset_projectId_kind_idx" ON "ComicUploadAsset"("projectId", "kind");
CREATE INDEX "ComicExportJob_projectId_createdAt_idx" ON "ComicExportJob"("projectId", "createdAt");
CREATE INDEX "ComicExportJob_format_status_idx" ON "ComicExportJob"("format", "status");
CREATE INDEX "ComicBatchJob_projectId_createdAt_idx" ON "ComicBatchJob"("projectId", "createdAt");
CREATE INDEX "ComicBatchJob_episodeId_status_idx" ON "ComicBatchJob"("episodeId", "status");
CREATE INDEX "ComicBatchJob_type_status_idx" ON "ComicBatchJob"("type", "status");

-- AddForeignKey
ALTER TABLE "ComicSourceBundle" ADD CONSTRAINT "ComicSourceBundle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComicCharacter" ADD CONSTRAINT "ComicCharacter_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComicEpisode" ADD CONSTRAINT "ComicEpisode_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComicPanel" ADD CONSTRAINT "ComicPanel_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "ComicEpisode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComicFact" ADD CONSTRAINT "ComicFact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComicUploadAsset" ADD CONSTRAINT "ComicUploadAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComicExportJob" ADD CONSTRAINT "ComicExportJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComicBatchJob" ADD CONSTRAINT "ComicBatchJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ComicProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComicBatchJob" ADD CONSTRAINT "ComicBatchJob_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "ComicEpisode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
