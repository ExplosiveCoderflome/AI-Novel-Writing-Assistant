import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { buildAgentCatalog } from "../agents/catalog";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.use(authMiddleware);

router.get("/", (_req, res) => {
  const data = buildAgentCatalog();
  res.status(200).json({
    success: true,
    data,
    message: "能力目录加载成功。",
  } satisfies ApiResponse<typeof data>);
});

export default router;
