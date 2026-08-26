import { Router } from "express";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import {
  MARKET_INFLUENCE_MODES,
  MARKET_FOUNDATION_SYNC_TARGETS,
  MARKET_RADAR_PLATFORMS,
  type CreateMarketCreativeBriefRequest,
  type StartMarketRadarAnalysisRequest,
} from "@ai-novel/shared/types/marketRadar";
import { validate } from "../../../middleware/validate";
import { marketRadarService } from "../application/MarketRadarService";

const router = Router();
const idParamsSchema = z.object({ id: z.string().trim().min(1) });
const scanSchema = z.object({ platforms: z.array(z.enum(MARKET_RADAR_PLATFORMS)).min(1).max(3).optional() });
const analysisSchema = z.object({
  selectedLists: z.array(z.object({
    platform: z.enum(MARKET_RADAR_PLATFORMS),
    listKey: z.string().trim().min(1).max(64),
  }).strict()).min(1).max(8).optional(),
  selectedItemIds: z.array(z.string().trim().min(1).max(64)).min(1).max(240).optional(),
}).strict();
const briefSchema = z.object({
  reportId: z.string().trim().min(1),
  signalIds: z.array(z.string().trim().min(1)).min(1).max(5),
  influenceMode: z.enum(MARKET_INFLUENCE_MODES),
});
const foundationSyncSchema = z.object({ target: z.enum(MARKET_FOUNDATION_SYNC_TARGETS) }).strict();

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

router.post("/scans/:id/analysis", validate({ params: idParamsSchema, body: analysisSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const run = await marketRadarService.startAnalysis(id, req.body as StartMarketRadarAnalysisRequest);
    res.status(run.report ? 200 : 202).json(ok(run, run.report ? "AI分析已完成。" : "AI分析已开始。"));
  } catch (error) { next(error); }
});

router.post("/briefs", validate({ body: briefSchema }), async (req, res, next) => {
  try { res.status(201).json(ok(await marketRadarService.createBrief(req.body as CreateMarketCreativeBriefRequest))); }
  catch (error) { next(error); }
});

router.post("/reports/:id/foundation-sync", validate({ params: idParamsSchema, body: foundationSyncSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const { target } = req.body as z.infer<typeof foundationSyncSchema>;
    res.json(ok(await marketRadarService.syncReportFoundation(id, target), "资源库处理完成。"));
  } catch (error) { next(error); }
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
