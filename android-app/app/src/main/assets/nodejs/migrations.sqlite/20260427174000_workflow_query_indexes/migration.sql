CREATE INDEX IF NOT EXISTS "ModelRouteConfig_provider_idx" ON "ModelRouteConfig"("provider");
CREATE INDEX IF NOT EXISTS "StoryPlan_novelId_level_externalRef_idx" ON "StoryPlan"("novelId", "level", "externalRef");
CREATE INDEX IF NOT EXISTS "StoryPlan_novelId_level_chapterId_idx" ON "StoryPlan"("novelId", "level", "chapterId");
