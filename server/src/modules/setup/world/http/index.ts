import { Router } from "express";
import { authMiddleware } from "../../../../middleware/auth";
import { registerCoreWorldRoutes } from "./worldCoreRoutes";
import { registerGenerationWorldRoutes } from "./worldGenerationRoutes";
import { registerStructureWorldRoutes } from "./worldStructureRoutes";
import { registerVisualizationWorldRoutes } from "./worldVisualizationRoutes";

const router = Router();

router.use(authMiddleware);

registerGenerationWorldRoutes(router);
registerCoreWorldRoutes(router);
registerStructureWorldRoutes(router);
registerVisualizationWorldRoutes(router);

export default router;
