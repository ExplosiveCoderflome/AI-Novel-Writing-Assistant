import type { Router } from "express";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { directorRiskPolicySchema } from "@ai-novel/shared/types/directorRisk";
import { validate } from "../../../../middleware/validate";
import { directorRiskPolicyOverrideService } from "../settings/DirectorRiskPolicyOverrideService";

const paramsSchema = z.object({
  id: z.string().trim().min(1),
});

const overrideSchema = z.object({
  override: directorRiskPolicySchema.nullable(),
});

export function registerNovelDirectorRiskPolicyRoutes(router: Router): void {
  router.get(
    "/:id/auto-director/risk-policy",
    validate({ params: paramsSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof paramsSchema>;
        const override = await directorRiskPolicyOverrideService.getOverride(id);
        res.status(200).json({
          success: true,
          data: { override },
          message: "本书自动导演风险规则已加载。",
        } satisfies ApiResponse<{ override: typeof override }>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/:id/auto-director/risk-policy",
    validate({ params: paramsSchema, body: overrideSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof paramsSchema>;
        const body = req.body as z.infer<typeof overrideSchema>;
        const override = await directorRiskPolicyOverrideService.saveOverride(id, body.override);
        res.status(200).json({
          success: true,
          data: { override },
          message: override ? "本书自动导演风险规则已保存。" : "本书将使用全局自动导演风险规则。",
        } satisfies ApiResponse<{ override: typeof override }>);
      } catch (error) {
        next(error);
      }
    },
  );
}
