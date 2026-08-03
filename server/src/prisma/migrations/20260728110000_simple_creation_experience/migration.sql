CREATE TYPE "CreationExperience" AS ENUM ('simple', 'professional');

ALTER TABLE "Novel"
ADD COLUMN "creationExperience" "CreationExperience" NOT NULL DEFAULT 'professional';
