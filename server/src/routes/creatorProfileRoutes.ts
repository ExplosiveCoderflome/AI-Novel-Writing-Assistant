import { Router } from "express";
import { creatorProfileService } from "../platform/profile/CreatorProfileService";
import type { PresetKey } from "../platform/profile/creatorProfileTypes";

export const creatorProfileRouter = Router();

/**
 * GET /api/creator/profile
 * Retrieves the current TELOS creator profile.
 */
creatorProfileRouter.get("/", async (_req, res) => {
  try {
    const data = await creatorProfileService.getProfile();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
});

/**
 * POST /api/creator/profile
 * Saves or updates the TELOS creator profile.
 */
creatorProfileRouter.post("/", async (req, res) => {
  try {
    const { profile, creatorName, activePreset } = req.body ?? {};
    if (!profile) {
      res.status(400).json({ success: false, error: "缺少 profile 必填参数" });
      return;
    }
    const saved = await creatorProfileService.saveProfile({
      creatorName,
      activePreset,
      profile,
    });
    res.json({ success: true, data: saved });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
});

/**
 * POST /api/creator/profile/preset
 * Loads a built-in aesthetic preset (修仙/悬疑/赛博/都市).
 */
creatorProfileRouter.post("/preset", async (req, res) => {
  try {
    const { presetKey } = req.body ?? {};
    if (!presetKey) {
      res.status(400).json({ success: false, error: "缺少 presetKey 参数" });
      return;
    }
    const saved = await creatorProfileService.loadPresetProfile(presetKey as PresetKey);
    res.json({ success: true, data: saved });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
});

/**
 * POST /api/creator/profile/interview-parse
 * Parses natural language Q&A text into structured TelosCreatorProfile fields.
 */
creatorProfileRouter.post("/interview-parse", async (req, res) => {
  try {
    const { qaText } = req.body ?? {};
    const parsed = creatorProfileService.parseInterviewInput(qaText ?? "");
    res.json({ success: true, data: parsed });
  } catch (error) {
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
});
