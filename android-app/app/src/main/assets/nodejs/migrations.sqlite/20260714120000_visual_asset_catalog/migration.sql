CREATE TABLE "VisualAssetProjection" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "sourceCreatedAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "VisualAssetProjection_sourceDomain_sourceType_sourceId_sourceVersion_key"
ON "VisualAssetProjection"("sourceDomain", "sourceType", "sourceId", "sourceVersion");

CREATE INDEX "VisualAssetProjection_scopeKind_scopeId_sourceCreatedAt_idx"
ON "VisualAssetProjection"("scopeKind", "scopeId", "sourceCreatedAt");

CREATE INDEX "VisualAssetProjection_kind_sourceCreatedAt_idx"
ON "VisualAssetProjection"("kind", "sourceCreatedAt");

CREATE INDEX "VisualAssetProjection_sourceDomain_sourceCreatedAt_idx"
ON "VisualAssetProjection"("sourceDomain", "sourceCreatedAt");
