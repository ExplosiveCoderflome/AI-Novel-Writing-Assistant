import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { streamToSSE } from "../llm/streaming";
import { validate } from "../middleware/validate";
import type { NovelService } from "../services/novel/NovelService";

const snapshotCreateSchema = z.object({
  triggerType: z.enum(["manual", "auto_milestone", "before_pipeline"]),
  label: z.string().trim().max(200).optional(),
});

const snapshotRestoreSchema = z.object({
  snapshotId: z.string().trim().min(1),
});

interface RegisterNovelSnapshotCharacterRoutesInput {
  router: Router;
  novelService: NovelService;
  idParamsSchema: z.ZodType<{ id: string }>;
  characterParamsSchema: z.ZodType<{ id: string; charId: string }>;
  characterSchema: z.ZodTypeAny;
  updateCharacterSchema: z.ZodTypeAny;
  characterTimelineSyncSchema: z.ZodTypeAny;
  llmGenerateSchema: z.ZodTypeAny;
  forwardBusinessError: (error: unknown, next: (err?: unknown) => void) => boolean;
}

export function registerNovelSnapshotCharacterRoutes(
  input: RegisterNovelSnapshotCharacterRoutesInput,
): void {
  const {
    router,
    novelService,
    idParamsSchema,
    characterParamsSchema,
    characterSchema,
    updateCharacterSchema,
    characterTimelineSyncSchema,
    llmGenerateSchema,
    forwardBusinessError,
  } = input;

  router.get("/:id/snapshots", validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.listNovelSnapshots(id);
      res.status(200).json({
        success: true,
        data,
        message: "Snapshots loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:id/snapshots",
    validate({ params: idParamsSchema, body: snapshotCreateSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const body = req.body as z.infer<typeof snapshotCreateSchema>;
        const data = await novelService.createNovelSnapshot(id, body.triggerType, body.label);
        res.status(201).json({
          success: true,
          data,
          message: "Snapshot created.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/snapshots/restore",
    validate({ params: idParamsSchema, body: snapshotRestoreSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const { snapshotId } = req.body as z.infer<typeof snapshotRestoreSchema>;
        const data = await novelService.restoreFromSnapshot(id, snapshotId);
        res.status(200).json({
          success: true,
          data,
          message: "Snapshot restored.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/:id/characters", validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.listCharacters(id);
      res.status(200).json({
        success: true,
        data,
        message: "Characters loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:id/characters",
    validate({ params: idParamsSchema, body: characterSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.createCharacter(id, req.body as any);
        res.status(201).json({
          success: true,
          data,
          message: "Character created.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        if (forwardBusinessError(error, next)) {
          return;
        }
        next(error);
      }
    },
  );

  router.put(
    "/:id/characters/:charId",
    validate({ params: characterParamsSchema, body: updateCharacterSchema }),
    async (req, res, next) => {
      try {
        const { id, charId } = req.params as z.infer<typeof characterParamsSchema>;
        const data = await novelService.updateCharacter(
          id,
          charId,
          req.body as any,
        );
        res.status(200).json({
          success: true,
          data,
          message: "Character updated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete("/:id/characters/:charId", validate({ params: characterParamsSchema }), async (req, res, next) => {
    try {
      const { id, charId } = req.params as z.infer<typeof characterParamsSchema>;
      await novelService.deleteCharacter(id, charId);
      res.status(200).json({
        success: true,
        message: "Character deleted.",
      } satisfies ApiResponse<null>);
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/:id/characters/:charId/timeline",
    validate({ params: characterParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, charId } = req.params as z.infer<typeof characterParamsSchema>;
        const data = await novelService.listCharacterTimeline(id, charId);
        res.status(200).json({
          success: true,
          data,
          message: "Character timeline loaded.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/characters/timeline/sync",
    validate({ params: idParamsSchema, body: characterTimelineSyncSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.syncAllCharacterTimeline(
          id,
          req.body as any,
        );
        res.status(200).json({
          success: true,
          data,
          message: "Character timelines synced.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/characters/:charId/timeline/sync",
    validate({ params: characterParamsSchema, body: characterTimelineSyncSchema }),
    async (req, res, next) => {
      try {
        const { id, charId } = req.params as z.infer<typeof characterParamsSchema>;
        const data = await novelService.syncCharacterTimeline(
          id,
          charId,
          req.body as any,
        );
        res.status(200).json({
          success: true,
          data,
          message: "Character timeline synced.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/characters/:charId/evolve",
    validate({ params: characterParamsSchema, body: llmGenerateSchema }),
    async (req, res, next) => {
      try {
        const { id, charId } = req.params as z.infer<typeof characterParamsSchema>;
        const data = await novelService.evolveCharacter(id, charId, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Character evolved.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/world-check/characters/:charId",
    validate({ params: characterParamsSchema, body: llmGenerateSchema }),
    async (req, res, next) => {
      try {
        const { id, charId } = req.params as z.infer<typeof characterParamsSchema>;
        const data = await novelService.checkCharacterAgainstWorld(
          id,
          charId,
          req.body as any,
        );
        res.status(200).json({
          success: true,
          data,
          message: "World check completed.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/bible/generate",
    validate({ params: idParamsSchema, body: llmGenerateSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const { stream, onDone } = await novelService.createBibleStream(
          id,
          req.body as any,
        );
        await streamToSSE(res, stream, onDone);
      } catch (error) {
        if (forwardBusinessError(error, next)) {
          return;
        }
        next(error);
      }
    },
  );
}
