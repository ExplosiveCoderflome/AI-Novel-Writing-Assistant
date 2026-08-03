ALTER TABLE "Character" ADD COLUMN "arcClimax" TEXT;
ALTER TABLE "Character" ADD COLUMN "arcEnd" TEXT;
ALTER TABLE "Character" ADD COLUMN "arcMidpoint" TEXT;
ALTER TABLE "Character" ADD COLUMN "arcStart" TEXT;
ALTER TABLE "Character" ADD COLUMN "castRole" TEXT;
ALTER TABLE "Character" ADD COLUMN "fear" TEXT;
ALTER TABLE "Character" ADD COLUMN "firstImpression" TEXT;
ALTER TABLE "Character" ADD COLUMN "innerNeed" TEXT;
ALTER TABLE "Character" ADD COLUMN "misbelief" TEXT;
ALTER TABLE "Character" ADD COLUMN "moralLine" TEXT;
ALTER TABLE "Character" ADD COLUMN "outerGoal" TEXT;
ALTER TABLE "Character" ADD COLUMN "relationToProtagonist" TEXT;
ALTER TABLE "Character" ADD COLUMN "secret" TEXT;
ALTER TABLE "Character" ADD COLUMN "storyFunction" TEXT;
ALTER TABLE "Character" ADD COLUMN "wound" TEXT;

ALTER TABLE "BookAnalysis" ADD COLUMN "pendingManualRecovery" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GenerationJob" ADD COLUMN "pendingManualRecovery" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ImageGenerationTask" ADD COLUMN "pendingManualRecovery" BOOLEAN NOT NULL DEFAULT false;
