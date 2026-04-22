PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_APIKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "key" TEXT,
    "model" TEXT,
    "baseURL" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_APIKey" ("createdAt", "id", "isActive", "key", "model", "provider", "updatedAt")
SELECT "createdAt", "id", "isActive", "key", "model", "provider", "updatedAt"
FROM "APIKey";

DROP TABLE "APIKey";
ALTER TABLE "new_APIKey" RENAME TO "APIKey";

CREATE UNIQUE INDEX "APIKey_provider_key" ON "APIKey"("provider");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
