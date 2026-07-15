CREATE TABLE "VisualAssetProjection" (
    "id" TEXT NOT NULL,
    "sourceDomain" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL DEFAULT 'current',
    "sourceLabel" TEXT NOT NULL,
    "scopeKind" TEXT NOT NULL DEFAULT 'global',
    "scopeId" TEXT,
    "scopeLabel" TEXT,
    "kind" TEXT NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'generated',
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "prompt" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT,
    "sourceCreatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisualAssetProjection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VisualAssetProjection_sourceDomain_sourceType_sourceId_sourceVersion_key"
ON "VisualAssetProjection"("sourceDomain", "sourceType", "sourceId", "sourceVersion");

CREATE INDEX "VisualAssetProjection_scopeKind_scopeId_sourceCreatedAt_idx"
ON "VisualAssetProjection"("scopeKind", "scopeId", "sourceCreatedAt");

CREATE INDEX "VisualAssetProjection_kind_sourceCreatedAt_idx"
ON "VisualAssetProjection"("kind", "sourceCreatedAt");

CREATE INDEX "VisualAssetProjection_sourceDomain_sourceCreatedAt_idx"
ON "VisualAssetProjection"("sourceDomain", "sourceCreatedAt");
