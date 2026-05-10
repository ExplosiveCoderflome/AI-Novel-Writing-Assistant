import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  CharacterVisibleProfileApplyResult,
  CharacterVisibleProfileBatchResult,
  CharacterVisibleProfileSuggestion,
} from "@ai-novel/shared/types/novel";
import { z } from "zod";
import { validate } from "../middleware/validate";
import type { NovelService } from "../services/novel/NovelService";

const visibleProfileFieldsSchema = z.object({
  appearance: z.string().trim().nullable().optional(),
  physique: z.string().trim().nullable().optional(),
  attireStyle: z.string().trim().nullable().optional(),
  signatureDetail: z.string().trim().nullable().optional(),
  voiceTexture: z.string().trim().nullable().optional(),
  presenceImpression: z.string().trim().nullable().optional(),
}).strict();

const visibleProfileApplySchema = z.object({
  fields: visibleProfileFieldsSchema,
});

const visibleProfileBatchApplySchema = z.object({
  items: z.array(z.object({
    characterId: z.string().trim().min(1),
    fields: visibleProfileFieldsSchema,
  })).min(1).max(80),
});

const visibleProfileGenerateSchema = z.object({
  provider: z.string().trim().optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
  userGuidance: z.string().trim().max(1200).optional(),
});

interface RegisterNovelCharacterVisibleProfileRoutesInput {
  router: Router;
  novelService: NovelService;
  idParamsSchema: z.ZodType<{ id: string }>;
  characterParamsSchema: z.ZodType<{ id: string; charId: string }>;
}

export function registerNovelCharacterVisibleProfileRoutes(
  input: RegisterNovelCharacterVisibleProfileRoutesInput,
): void {
  const {
    router,
    novelService,
    idParamsSchema,
    characterParamsSchema,
  } = input;

  router.post(
    "/:id/characters/:charId/visible-profile/generate",
    validate({ params: characterParamsSchema, body: visibleProfileGenerateSchema }),
    async (req, res, next) => {
      try {
        const { id, charId } = req.params as z.infer<typeof characterParamsSchema>;
        const data = await novelService.generateCharacterVisibleProfile(id, charId, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "外显资料建议已生成。",
        } satisfies ApiResponse<CharacterVisibleProfileSuggestion>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/characters/:charId/visible-profile/apply",
    validate({ params: characterParamsSchema, body: visibleProfileApplySchema }),
    async (req, res, next) => {
      try {
        const { id, charId } = req.params as z.infer<typeof characterParamsSchema>;
        const body = req.body as z.infer<typeof visibleProfileApplySchema>;
        const data = await novelService.applyCharacterVisibleProfile(id, charId, body.fields);
        res.status(200).json({
          success: true,
          data,
          message: data.appliedFields.length > 0 ? "外显资料已写入角色卡。" : "没有新的外显资料需要写入。",
        } satisfies ApiResponse<CharacterVisibleProfileApplyResult>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/characters/visible-profile/batch-generate",
    validate({ params: idParamsSchema, body: visibleProfileGenerateSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.generateBatchCharacterVisibleProfiles(id, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "全书角色外显资料建议已生成。",
        } satisfies ApiResponse<CharacterVisibleProfileBatchResult>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/characters/visible-profile/batch-apply",
    validate({ params: idParamsSchema, body: visibleProfileBatchApplySchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const body = req.body as z.infer<typeof visibleProfileBatchApplySchema>;
        const data = await novelService.applyBatchCharacterVisibleProfiles(id, body.items);
        res.status(200).json({
          success: true,
          data,
          message: "已按确认结果写入角色外显资料。",
        } satisfies ApiResponse<{ novelId: string; results: CharacterVisibleProfileApplyResult[] }>);
      } catch (error) {
        next(error);
      }
    },
  );
}
