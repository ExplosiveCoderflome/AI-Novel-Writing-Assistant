import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { CompleteQuickSetupRequest } from "@ai-novel/shared/types/onboarding";
import { z } from "zod";
import { authMiddleware } from "../../../../middleware/auth";
import { validate } from "../../../../middleware/validate";
import {
  completeQuickSetup,
  getQuickSetupStatus,
} from "../application/QuickSetupService";
import { getFirstNovelOnboardingProjection } from "../application/FirstNovelOnboardingService";

const router = Router();

const completeQuickSetupSchema = z.object({
  providerKind: z.enum(["builtin", "custom"]),
  provider: z.string().trim().min(1).optional(),
  customProviderName: z.string().trim().min(1).optional(),
  apiKey: z.string().trim().optional(),
  baseURL: z.string().trim().url("API 地址格式不正确。").optional(),
  model: z.string().trim().min(1, "模型名称不能为空。"),
});

router.use(authMiddleware);

router.get("/settings/quick-setup/status", async (_req, res, next) => {
  try {
    const data = await getQuickSetupStatus();
    res.status(200).json({
      success: true,
      data,
      message: data.readyForCreation ? "创作环境可用。" : "还需要完成创作环境配置。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/settings/comfyui/status", async (_req, res, next) => {
  try {
    const { comfyUIDaemonService } = await import("../../../../services/image/comfyui/ComfyUIDaemonService");
    const data = await comfyUIDaemonService.checkDaemonHealth();
    res.status(200).json({
      success: true,
      data,
      message: data.message,
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/settings/comfyui/launch", async (req, res, next) => {
  try {
    const { customPath } = (req.body ?? {}) as { customPath?: string };
    if (customPath && typeof customPath === "string" && customPath.trim()) {
      process.env.COMFYUI_PATH = customPath.trim();
    }
    const { comfyUIDaemonService } = await import("../../../../services/image/comfyui/ComfyUIDaemonService");
    const data = await comfyUIDaemonService.ensureDaemonStarted();
    res.status(200).json({
      success: true,
      data,
      message: data.message,
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/settings/comfyui/download-model", async (_req, res, next) => {
  try {
    const { comfyUIDaemonService } = await import("../../../../services/image/comfyui/ComfyUIDaemonService");
    const data = await comfyUIDaemonService.triggerAutoDownloadModel();
    res.status(200).json({
      success: true,
      data,
      message: "已成功启动离线生图模型全自动下载后台任务。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/settings/quick-setup/complete",
  validate({ body: completeQuickSetupSchema }),
  async (req, res, next) => {
    try {
      const data = await completeQuickSetup(req.body as CompleteQuickSetupRequest);
      res.status(200).json({
        success: true,
        data,
        message: "创作环境配置完成，可以开始写小说了。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get("/onboarding/first-novel", async (_req, res, next) => {
  try {
    const data = await getFirstNovelOnboardingProjection();
    res.status(200).json({
      success: true,
      data,
      message: "第一本书创作进度已更新。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

export default router;
