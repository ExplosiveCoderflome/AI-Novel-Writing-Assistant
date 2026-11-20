import { Router } from "express";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { RagConnectionTestResult } from "@ai-novel/shared/types/ragConnectivity";
import { validate } from "../../../middleware/validate";
import { RagConnectionTestService } from "./RagConnectionTestService";

const endpointSchema = z.string().trim().max(2048).url().refine((value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}, "请填写不含账号、查询参数或片段的 HTTP/HTTPS 服务地址。");
const keySchema = z.string().trim().max(8192).optional();
const embeddingSchema = z.object({
  embeddingProvider: z.string().trim().min(1).max(120),
  embeddingModel: z.string().trim().min(1).max(240),
  embeddingApiKey: keySchema,
  embeddingBaseURL: z.union([endpointSchema, z.literal("")]).optional(),
  embeddingTimeoutMs: z.number().int().min(5000).max(300000),
}).strict();
const qdrantSchema = z.object({
  qdrantUrl: endpointSchema,
  qdrantApiKey: keySchema,
  clearQdrantApiKey: z.boolean().optional(),
  qdrantTimeoutMs: z.number().int().min(1000).max(300000),
}).strict();

export function createRagConnectionTestRouter(service = new RagConnectionTestService()): Router {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
  router.post("/embedding", validate({ body: embeddingSchema }), async (req, res, next) => {
    try {
      const data = await service.testEmbedding(req.body as z.infer<typeof embeddingSchema>);
      res.json({ success: true, data } satisfies ApiResponse<RagConnectionTestResult>);
    } catch (error) { next(error); }
  });
  router.post("/qdrant", validate({ body: qdrantSchema }), async (req, res, next) => {
    try {
      const data = await service.testQdrant(req.body as z.infer<typeof qdrantSchema>);
      res.json({ success: true, data } satisfies ApiResponse<RagConnectionTestResult>);
    } catch (error) { next(error); }
  });
  return router;
}
