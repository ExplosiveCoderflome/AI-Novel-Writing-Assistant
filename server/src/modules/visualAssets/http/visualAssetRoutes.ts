import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { VISUAL_ASSET_KINDS, VISUAL_ASSET_SOURCES, type VisualAssetScopeKind } from "@ai-novel/shared/types/visualAsset";
import { z } from "zod";
import { authMiddleware } from "../../../middleware/auth";
import { validate } from "../../../middleware/validate";
import { visualAssetCatalogService } from "../application/VisualAssetCatalogService";

const scopeKinds = ["global", "novel", "book_analysis", "comic_project", "drama_project"] as const satisfies readonly VisualAssetScopeKind[];

const querySchema = z.object({
  scopeKind: z.enum(scopeKinds).optional(),
  scopeId: z.string().trim().min(1).optional(),
  allowedKinds: z.string().trim().optional(),
  kind: z.enum(VISUAL_ASSET_KINDS).optional(),
  source: z.enum(VISUAL_ASSET_SOURCES).optional(),
  query: z.string().trim().max(240).optional(),
  cursor: z.string().trim().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(60).optional(),
});

const paramsSchema = z.object({ assetId: z.string().trim().min(1) });

function parseAllowedKinds(value: string | undefined) {
  if (!value) return undefined;
  const values = Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)));
  const parsed = z.array(z.enum(VISUAL_ASSET_KINDS)).safeParse(values);
  if (!parsed.success) throw parsed.error;
  return parsed.data;
}

function toInput(query: z.infer<typeof querySchema>) {
  return {
    scope: query.scopeKind ? { kind: query.scopeKind, id: query.scopeId } : undefined,
    allowedKinds: parseAllowedKinds(query.allowedKinds),
    kind: query.kind,
    source: query.source,
    query: query.query,
    cursor: query.cursor,
    limit: query.limit,
  };
}

const router = Router();
router.use(authMiddleware);

router.get("/", validate({ query: querySchema }), async (req, res, next) => {
  try {
    const query = querySchema.parse(req.query);
    const data = await visualAssetCatalogService.list(toInput(query));
    res.json({ success: true, data, message: "Visual assets fetched." } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/facets", validate({ query: querySchema }), async (req, res, next) => {
  try {
    const query = querySchema.parse(req.query);
    const { cursor: _cursor, limit: _limit, kind: _kind, source: _source, ...input } = toInput(query);
    const data = await visualAssetCatalogService.facets(input);
    res.json({ success: true, data, message: "Visual asset filters fetched." } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/:assetId", validate({ params: paramsSchema }), async (req, res, next) => {
  try {
    const { assetId } = req.params as z.infer<typeof paramsSchema>;
    const data = await visualAssetCatalogService.get(assetId);
    res.json({ success: true, data, message: "Visual asset fetched." } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

export default router;
