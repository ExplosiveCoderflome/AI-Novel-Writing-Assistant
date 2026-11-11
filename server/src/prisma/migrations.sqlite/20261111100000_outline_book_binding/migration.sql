CREATE TABLE "OutlineBookBinding" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "projectId" TEXT NOT NULL,
 "revisionId" TEXT NOT NULL,
 "revisionVersion" INTEGER NOT NULL,
 "sourceDocumentHash" TEXT NOT NULL,
 "novelId" TEXT NOT NULL,
 "requestKey" TEXT NOT NULL,
 "requestHash" TEXT NOT NULL,
 "mappingSchemaVersion" INTEGER NOT NULL DEFAULT 1,
 "mappingJson" TEXT NOT NULL,
 "policyVersion" INTEGER NOT NULL DEFAULT 1,
 "policyJson" TEXT NOT NULL,
 "postCreateStateJson" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL,
 CONSTRAINT "OutlineBookBinding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "OutlineProject"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "OutlineBookBinding_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OutlineBookBinding_projectId_key" ON "OutlineBookBinding"("projectId");
CREATE UNIQUE INDEX "OutlineBookBinding_novelId_key" ON "OutlineBookBinding"("novelId");
CREATE UNIQUE INDEX "OutlineBookBinding_requestKey_key" ON "OutlineBookBinding"("requestKey");
