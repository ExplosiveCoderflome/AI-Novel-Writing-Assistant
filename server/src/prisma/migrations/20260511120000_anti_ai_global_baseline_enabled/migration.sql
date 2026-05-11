ALTER TABLE "AntiAiRule" ADD COLUMN "globalBaselineEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "AntiAiRule"
SET "globalBaselineEnabled" = true
WHERE "enabled" = true
  AND "type" IN ('forbidden', 'risk');

CREATE INDEX "AntiAiRule_globalBaselineEnabled_enabled_idx"
ON "AntiAiRule"("globalBaselineEnabled", "enabled");
