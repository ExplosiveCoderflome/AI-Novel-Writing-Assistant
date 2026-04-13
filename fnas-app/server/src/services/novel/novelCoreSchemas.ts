import { z } from "zod";

export const novelCoreJsonObjectSchema = z
  .record(z.string(), z.unknown());

// NovelCoreService: 角色演进编辑输出
export const characterEvolutionOutputSchema = z
  .object({
    personality: z.string().trim().optional(),
    background: z.string().trim().optional(),
    development: z.string().trim().optional(),
    currentState: z.string().trim().optional(),
    currentGoal: z.string().trim().optional(),
  })
  .passthrough();

// NovelCoreService: 角色设定审计输出
export const characterWorldCheckOutputSchema = z
  .object({
    status: z.enum(["pass", "warn", "error"]).optional(),
    warnings: z.array(z.string().trim()).optional(),
    issues: z
      .array(
        z.object({
          severity: z.enum(["warn", "error"]),
          message: z.string().trim().min(1),
          suggestion: z.string().trim().optional(),
        }),
      )
      .optional(),
  })
  .passthrough();

// NovelBible / 其它“作品圣经 JSON”通常会被 normalizeNovelBiblePayload 进一步归一化。
export const novelBiblePayloadSchema = novelCoreJsonObjectSchema;

