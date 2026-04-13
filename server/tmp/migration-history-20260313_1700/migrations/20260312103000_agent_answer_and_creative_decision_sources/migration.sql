ALTER TABLE "CreativeDecision" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "CreativeDecision" ADD COLUMN "sourceRefId" TEXT;
ALTER TABLE "CreativeDecision" ADD COLUMN "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

PRAGMA writable_schema=1;
UPDATE sqlite_master
SET sql = replace(sql, 'approval)', 'approval, answer)')
WHERE type = 'table'
  AND name = 'AgentStep'
  AND sql LIKE '%CHECK ("stepType" IN (%';
PRAGMA writable_schema=0;

PRAGMA integrity_check;
