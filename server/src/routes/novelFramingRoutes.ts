import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { BookFramingSuggestionInput } from "@ai-novel/shared/types/novelFraming";
import { z } from "zod";
import { llmProviderSchema } from "../llm/providerSchema";
import { validate } from "../middleware/validate";
import { novelFramingSuggestionService } from "../services/novel/NovelFramingSuggestionService";

const llmGenerateSchema = z.object({
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const framingSuggestSchema = llmGenerateSchema.extend({
  title: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  genreLabel: z.string().trim().max(120).optional(),
  styleTone: z.string().trim().max(120).optional(),
}).refine((value) => Boolean(value.title?.trim() || value.description?.trim()), {
  message: "请至少填写书名或一句话概述。",
});

interface RegisterNovelFramingRoutesInput {
  router: Router;
}

export function registerNovelFramingRoutes(input: RegisterNovelFramingRoutesInput): void {
  const { router } = input;

  router.post(
    "/framing/suggest",
    validate({ body: framingSuggestSchema }),
    async (req, res, next) => {
      try {
        const body = req.body as z.infer<typeof framingSuggestSchema>;
        const data = await novelFramingSuggestionService.suggest(body as BookFramingSuggestionInput);
        res.status(200).json({
          success: true,
          data,
          message: "Book framing suggestion generated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
}
