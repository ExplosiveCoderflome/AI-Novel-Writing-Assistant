import { Router } from "express";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import {
  MARKET_INFLUENCE_MODES,
  MARKET_RADAR_PLATFORMS,
  type CreateMarketCreativeBriefRequest,
} from "@ai-novel/shared/types/marketRadar";
import { validate } from "../../../middleware/validate";
import { marketRadarService } from "../application/MarketRadarService";

const router = Router();
const idParamsSchema = z.object({ id: z.string().trim().min(1) });
const scanSchema = z.object({ platforms: z.array(z.enum(MARKET_RADAR_PLATFORMS)).min(1).max(3).optional() });
const briefSchema = z.object({
  reportId: z.string().trim().min(1),
  signalIds: z.array(z.string().trim().min(1)).min(1).max(5),
  influenceMode: z.enum(MARKET_INFLUENCE_MODES),
});

function ok<T>(data: T, message?: string): ApiResponse<T> {
  return { success: true, data, message };
}

router.get("/sources", (_req, res) => res.json(ok(marketRadarService.listSources())));

router.get("/latest", async (_req, res, next) => {
  try { res.json(ok(await marketRadarService.getLatest())); } catch (error) { next(error); }
});

router.post("/scans", validate({ body: scanSchema }), async (req, res, next) => {
  try {
    const run = await marketRadarService.startScan(req.body.platforms);
    res.status(run.status === "queued" || run.status === "running" ? 202 : 200).json(ok(run, "扫榜任务已准备。"));
  } catch (error) { next(error); }
});

router.get("/scans/:id", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const run = await marketRadarService.getScan(id);
    if (!run) { res.status(404).json({ success: false, error: "扫榜任务不存在。" }); return; }
    res.json(ok(run));
  } catch (error) { next(error); }
});

router.post("/briefs", validate({ body: briefSchema }), async (req, res, next) => {
  try { res.status(201).json(ok(await marketRadarService.createBrief(req.body as CreateMarketCreativeBriefRequest))); }
  catch (error) { next(error); }
});

router.get("/briefs/:id", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const brief = await marketRadarService.getBrief(id);
    if (!brief) { res.status(404).json({ success: false, error: "市场创作简报不存在。" }); return; }
    res.json(ok(brief));
  } catch (error) { next(error); }
});

export default router;
