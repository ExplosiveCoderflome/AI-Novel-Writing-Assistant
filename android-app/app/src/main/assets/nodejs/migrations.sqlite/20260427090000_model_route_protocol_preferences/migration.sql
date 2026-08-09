ALTER TABLE "ModelRouteConfig" ADD COLUMN "requestProtocol" TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE "ModelRouteConfig" ADD COLUMN "structuredResponseFormat" TEXT NOT NULL DEFAULT 'auto';
