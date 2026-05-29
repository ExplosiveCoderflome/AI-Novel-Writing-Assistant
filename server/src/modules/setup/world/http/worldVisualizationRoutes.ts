import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { validate } from "../../../../middleware/validate";
import {
  requireWorldVisualization,
  requireWorldWizard,
  worldIdSchema,
  worldService,
} from "./worldHttpContext";

export function registerVisualizationWorldRoutes(router: Router): void {
  router.get("/:id/visualization", requireWorldWizard, requireWorldVisualization, validate({ params: worldIdSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof worldIdSchema>;
      const data = await worldService.getVisualization(id);
      res.status(200).json({
        success: true,
        data,
        message: "Visualization loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });
}
