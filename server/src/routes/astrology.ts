import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.use(authMiddleware);

router.get("/", (_req, res) => {
  const response: ApiResponse<null> = {
    success: false,
    error: "占星模块暂未实现。",
  };
  res.status(501).json(response);
});

export default router;
