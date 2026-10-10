import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { agentRuntime } from "../../../../agents";
import { validate } from "../../../../middleware/validate";
import type { NovelApplicationServices } from "../../../../services/novel/application/NovelApplicationContracts";

interface RegisterNovelChapterRoutesInput {
  router: Router;
  novelService: Pick<NovelApplicationServices,
    | "listChapters"
    | "createChapter"
    | "updateChapter"
    | "deleteChapter"
    | "ensureChapterExecutionContract"
    | "listChapterSnapshots"
    | "getChapterSnapshot"
  >;
  idParamsSchema: z.ZodType<{ id: string }>;
  chapterParamsSchema: z.ZodType<{ id: string; chapterId: string }>;
  chapterSchema: z.ZodTypeAny;
  updateChapterSchema: z.ZodTypeAny;
  chapterExecutionContractSchema: z.ZodTypeAny;
}

export function registerNovelChapterRoutes(input: RegisterNovelChapterRoutesInput): void {
  const {
    router,
    novelService,
    idParamsSchema,
    chapterParamsSchema,
    chapterSchema,
    updateChapterSchema,
    chapterExecutionContractSchema,
  } = input;

  router.get("/:id/chapters", validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.listChapters(id);
      res.status(200).json({
        success: true,
        data,
        message: "Chapters loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:id/chapters",
    validate({ params: idParamsSchema, body: chapterSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.createChapter(id, req.body as any);
        res.status(201).json({
          success: true,
          data,
          message: "Chapter created.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/:id/chapters/:chapterId",
    validate({ params: chapterParamsSchema, body: updateChapterSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.updateChapter(
          id,
          chapterId,
          req.body as any,
        );
        res.status(200).json({
          success: true,
          data,
          message: "Chapter updated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete("/:id/chapters/:chapterId", validate({ params: chapterParamsSchema }), async (req, res, next) => {
    try {
      const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
      await novelService.deleteChapter(id, chapterId);
      res.status(200).json({
        success: true,
        message: "Chapter deleted.",
      } satisfies ApiResponse<null>);
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/:id/chapters/:chapterId/snapshots",
    validate({ params: chapterParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.listChapterSnapshots(id, chapterId);
        res.status(200).json({ success: true, data, message: "Chapter snapshots loaded." } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/:id/chapters/:chapterId/snapshots/:snapshotId",
    validate({
      params: z.object({
        id: z.string().trim().min(1),
        chapterId: z.string().trim().min(1),
        snapshotId: z.string().trim().min(1),
      }),
    }),
    async (req, res, next) => {
      try {
        const { id, chapterId, snapshotId } = req.params as z.infer<typeof chapterParamsSchema> & { snapshotId: string };
        const data = await novelService.getChapterSnapshot(id, chapterId, snapshotId);
        res.status(200).json({ success: true, data, message: "Chapter snapshot loaded." } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/:id/chapters/:chapterId/traces",
    validate({ params: chapterParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await agentRuntime.listRuns({ novelId: id, chapterId, limit: 20 });
        res.status(200).json({
          success: true,
          data,
          message: "Chapter traces loaded.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/chapters/:chapterId/execution-contract",
    validate({ params: chapterParamsSchema, body: chapterExecutionContractSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.ensureChapterExecutionContract(id, chapterId, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Chapter execution contract generated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
}
