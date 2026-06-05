import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import {
  storyWorldSliceBuilderModeSchema,
  storyWorldSliceOverridesSchema,
} from "@ai-novel/shared/types/storyWorldSlice";
import {
  novelWorldGenerateInputSchema,
  novelWorldImportInputSchema,
  novelWorldManualInputSchema,
  novelWorldSaveToLibraryInputSchema,
  novelWorldSyncInputSchema,
} from "@ai-novel/shared/types/novelWorld";
import { z } from "zod";
import { llmProviderSchema } from "../../../../llm/providerSchema";
import { validate } from "../../../../middleware/validate";
import type { NovelApplicationServices } from "../../../../services/novel/application/NovelApplicationContracts";

const llmGenerateSchema = z.object({
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const refreshWorldSliceSchema = llmGenerateSchema.extend({
  storyInput: z.string().trim().optional(),
  builderMode: storyWorldSliceBuilderModeSchema.optional(),
});

interface RegisterNovelWorldSliceRoutesInput {
  router: Router;
  idParamsSchema: z.ZodType<{ id: string }>;
  novelService: Pick<NovelApplicationServices,
    | "getNovelWorld"
    | "getNovelWorldSyncDiff"
    | "importNovelWorldFromLibrary"
    | "createManualNovelWorld"
    | "generateNovelWorldFromTheme"
    | "saveNovelWorldToLibrary"
    | "syncNovelWorldWithLibrary"
    | "getWorldSlice"
    | "refreshWorldSlice"
    | "updateWorldSliceOverrides"
  >;
}

export function registerNovelWorldSliceRoutes(input: RegisterNovelWorldSliceRoutesInput): void {
  const { router, idParamsSchema, novelService } = input;

  router.get("/:id/novel-world", validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.getNovelWorld(id);
      res.status(200).json({
        success: true,
        data,
        message: "Novel world loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:id/novel-world/import",
    validate({ params: idParamsSchema, body: novelWorldImportInputSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const body = req.body as z.infer<typeof novelWorldImportInputSchema>;
        const data = await novelService.importNovelWorldFromLibrary({
          novelId: id,
          worldId: body.worldId,
          syncEnabled: body.syncEnabled,
          syncDirection: body.syncDirection,
        });
        res.status(200).json({
          success: true,
          data,
          message: "World imported into novel.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/novel-world/manual",
    validate({ params: idParamsSchema, body: novelWorldManualInputSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const body = req.body as z.infer<typeof novelWorldManualInputSchema>;
        const data = await novelService.createManualNovelWorld({
          novelId: id,
          title: body.title,
          coverSummary: body.coverSummary,
        });
        res.status(200).json({
          success: true,
          data,
          message: "Manual novel world created.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/novel-world/generate",
    validate({ params: idParamsSchema, body: novelWorldGenerateInputSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const body = req.body as z.infer<typeof novelWorldGenerateInputSchema>;
        const data = await novelService.generateNovelWorldFromTheme({
          novelId: id,
          saveToLibrary: body.saveToLibrary,
          provider: body.provider,
          model: body.model,
          temperature: body.temperature,
        });
        res.status(200).json({
          success: true,
          data,
          message: "Novel world generated from theme.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/novel-world/save-to-library",
    validate({ params: idParamsSchema, body: novelWorldSaveToLibraryInputSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const body = req.body as z.infer<typeof novelWorldSaveToLibraryInputSchema>;
        const data = await novelService.saveNovelWorldToLibrary({
          novelId: id,
          syncEnabled: body.syncEnabled,
        });
        res.status(200).json({
          success: true,
          data,
          message: "Novel world saved to library.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/:id/novel-world/sync-diff", validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.getNovelWorldSyncDiff(id);
      res.status(200).json({
        success: true,
        data,
        message: "Novel world sync diff loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:id/novel-world/sync",
    validate({ params: idParamsSchema, body: novelWorldSyncInputSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.syncNovelWorldWithLibrary(
          id,
          req.body as z.infer<typeof novelWorldSyncInputSchema>,
        );
        res.status(200).json({
          success: true,
          data,
          message: "Novel world synchronized.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/:id/world-slice", validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.getWorldSlice(id);
      res.status(200).json({
        success: true,
        data,
        message: "Novel world slice loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:id/world-slice/refresh",
    validate({ params: idParamsSchema, body: refreshWorldSliceSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const body = req.body as z.infer<typeof refreshWorldSliceSchema>;
        const data = await novelService.refreshWorldSlice(id, body);
        res.status(200).json({
          success: true,
          data,
          message: "Novel world slice refreshed.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/:id/world-slice/overrides",
    validate({ params: idParamsSchema, body: storyWorldSliceOverridesSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.updateWorldSliceOverrides(
          id,
          req.body as z.infer<typeof storyWorldSliceOverridesSchema>,
        );
        res.status(200).json({
          success: true,
          data,
          message: "Novel world slice preferences updated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
}
