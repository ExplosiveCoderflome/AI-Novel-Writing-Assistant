import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { NOVEL_EXPORT_FORMAT_VALUES, NOVEL_EXPORT_SCOPE_VALUES } from "@ai-novel/shared/types/novelExport";
import { authMiddleware } from "../../../middleware/auth";
import { validate } from "../../../middleware/validate";
import { novelExportService } from "../novelExport.service";

const router = Router();

const idParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const exportQuerySchema = z.object({
  format: z.enum(NOVEL_EXPORT_FORMAT_VALUES).default("txt"),
  scope: z.enum(NOVEL_EXPORT_SCOPE_VALUES).default("full"),
});

router.use(authMiddleware);

router.get(
  "/:id/export",
  validate({ params: idParamsSchema, query: exportQuerySchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const { format, scope } = exportQuerySchema.parse(req.query);
      const data = await novelExportService.buildExportContent(id, format, scope);
      res.setHeader("Content-Type", data.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(data.fileName)}"`);
      res.status(200).send(data.content);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/export-as-document",
  validate({ params: idParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelExportService.exportAsKnowledgeDocument(id);
      res.status(201).json({
        success: true,
        data,
        message: "Novel exported as knowledge document.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
