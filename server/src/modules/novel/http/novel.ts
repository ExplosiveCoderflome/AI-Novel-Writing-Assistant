import { Router } from "express";
import { authMiddleware } from "../../../middleware/auth";
import { createNovelHttpServices } from "./novelHttpServices";
import { registerNovelHttpRoutes } from "./novelRouteRegistration";

const router = Router();
const services = createNovelHttpServices();

router.use(authMiddleware);
registerNovelHttpRoutes(router, services);

export default router;
