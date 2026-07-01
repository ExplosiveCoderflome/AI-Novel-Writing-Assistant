import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  getAutoDirectorChannelSettings,
  saveAutoDirectorChannelSettings,
} from "../services/settings/AutoDirectorChannelSettingsService";
import {
  DIRECTOR_AUTO_APPROVAL_POINTS,
} from "@ai-novel/shared/types/autoDirectorApproval";
import {
  getAutoDirectorApprovalPreferenceSettings,
  saveAutoDirectorApprovalPreferenceSettings,
} from "../services/settings/AutoDirectorApprovalPreferenceService";
import { qualityDebtSettingsService } from "../services/settings/QualityDebtSettingsService";

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

const autoApprovalPointValues = DIRECTOR_AUTO_APPROVAL_POINTS.map((item) => item.code) as [string, ...string[]];

const autoDirectorApprovalPreferenceSchema = z.object({
  approvalPointCodes: z.array(z.enum(autoApprovalPointValues)),
});

const pendingReviewAutoPromotionSchema = z.object({
  enabled: z.boolean(),
  acknowledgedRisks: z.boolean().optional(),
  confirmationText: z.string().trim().optional(),
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

router.get("/approval-preferences", async (_req, res, next) => {
  try {
    const data = await getAutoDirectorApprovalPreferenceSettings();
    res.status(200).json({
      success: true,
      data,
      message: "Loaded auto director approval preferences.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put(
  "/approval-preferences",
  validate({ body: autoDirectorApprovalPreferenceSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof autoDirectorApprovalPreferenceSchema>;
      const data = await saveAutoDirectorApprovalPreferenceSettings(body);
      res.status(200).json({
        success: true,
        data,
        message: "Auto director approval preferences saved.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get("/pending-review-auto-promotion", async (_req, res, next) => {
  try {
    const data = await qualityDebtSettingsService.getAutoPromotionSettings();
    res.status(200).json({
      success: true,
      data,
      message: "待确认状态自动放行设置已加载。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put(
  "/pending-review-auto-promotion",
  validate({ body: pendingReviewAutoPromotionSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof pendingReviewAutoPromotionSchema>;
      const data = await qualityDebtSettingsService.saveAutoPromotionSettings(body);
      res.status(200).json({
        success: true,
        data,
        message: data.enabled ? "待确认状态自动放行已开启。" : "待确认状态自动放行已关闭。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
