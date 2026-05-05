CREATE TABLE IF NOT EXISTS "LlmInvocationDiagnostic" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "taskId" TEXT,
  "novelId" TEXT,
  "promptId" TEXT,
  "promptVersion" TEXT,
  "stage" TEXT,
  "itemKey" TEXT,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "baseUrlHost" TEXT,
  "requestProtocol" TEXT,
  "strategy" TEXT,
  "status" TEXT NOT NULL,
  "errorCategory" TEXT,
  "errorMessage" TEXT,
  "upstreamRequestId" TEXT,
  "estimatedInputTokens" INTEGER,
  "renderedPromptChars" INTEGER,
  "messageChars" INTEGER,
  "rawChars" INTEGER,
  "latencyMs" INTEGER,
  "warningCode" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "LlmInvocationDiagnostic_taskId_createdAt_idx" ON "LlmInvocationDiagnostic"("taskId", "createdAt");
CREATE INDEX IF NOT EXISTS "LlmInvocationDiagnostic_novelId_createdAt_idx" ON "LlmInvocationDiagnostic"("novelId", "createdAt");
CREATE INDEX IF NOT EXISTS "LlmInvocationDiagnostic_promptId_createdAt_idx" ON "LlmInvocationDiagnostic"("promptId", "createdAt");
CREATE INDEX IF NOT EXISTS "LlmInvocationDiagnostic_status_createdAt_idx" ON "LlmInvocationDiagnostic"("status", "createdAt");
