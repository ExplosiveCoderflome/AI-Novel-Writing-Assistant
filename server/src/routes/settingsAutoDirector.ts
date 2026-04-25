import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  getAutoDirectorChannelSettings,
  saveAutoDirectorChannelSettings,
} from "../services/settings/AutoDirectorChannelSettingsService";

const router = Router();

const autoDirectorChannelSchema = z.object({
  webhookUrl: z.string().trim().optional(),
  callbackToken: z.string().trim().optional(),
  operatorMapJson: z.string().trim().optional(),
  eventTypes: z.array(z.string().trim().min(1)).optional(),
});

const autoDirectorChannelSettingsSchema = z.object({
  baseUrl: z.union([z.string().trim().url("Base URL is invalid."), z.literal("")]).optional(),
  dingtalk: autoDirectorChannelSchema.optional(),
  wecom: autoDirectorChannelSchema.optional(),
});

router.use(authMiddleware);

router.get("/channels", async (_req, res, next) => {
  try {
    const data = await getAutoDirectorChannelSettings();
    res.status(200).json({
      success: true,
      data,
      message: "Loaded auto director channel settings.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put(
  "/channels",
  validate({ body: autoDirectorChannelSettingsSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof autoDirectorChannelSettingsSchema>;
      const data = await saveAutoDirectorChannelSettings(body);
      res.status(200).json({
        success: true,
        data,
        message: "Auto director channel settings saved.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
