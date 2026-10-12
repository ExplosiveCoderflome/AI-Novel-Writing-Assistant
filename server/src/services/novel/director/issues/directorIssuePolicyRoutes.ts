import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { directorIssuePolicyOverrideSchema } from "@ai-novel/shared/types/directorIssue";
import { z } from "zod";
import { validate } from "../../../../middleware/validate";
import { directorIssuePolicyService } from "./DirectorIssuePolicyService";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const bodySchema = z.object({ override: directorIssuePolicyOverrideSchema.nullable() });

export function registerDirectorIssuePolicyRoutes(router: Router): void {
  router.get(
    "/:id/auto-director/issue-policy",
    validate({ params: paramsSchema }),
    async (req, res, next) => {
      try {
        const { id } = paramsSchema.parse(req.params);
        const data = await directorIssuePolicyService.getNovelPolicy(id);
        res.status(200).json({
          success: true,
          data,
          message: "本书问题处理规则已加载。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/:id/auto-director/issue-policy",
    validate({ params: paramsSchema, body: bodySchema }),
    async (req, res, next) => {
      try {
        const { id } = paramsSchema.parse(req.params);
        const body = req.body as z.infer<typeof bodySchema>;
        const data = await directorIssuePolicyService.saveNovelOverride(id, body.override);
        res.status(200).json({
          success: true,
          data,
          message: body.override ? "本书问题处理规则已保存。" : "本书将继承全局问题处理规则。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
}
