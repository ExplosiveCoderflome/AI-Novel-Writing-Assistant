import { z } from "zod";

export const directorIdeaInspirationAngles = [
  "爽点强钩子",
  "人物成长线",
  "设定奇观线",
  "关系牵引线",
  "悬念追查线",
] as const;

export const directorIdeaInspirationSchema = z.object({
  ideas: z.array(z.object({
    angle: z.enum(directorIdeaInspirationAngles),
    text: z.string().trim().min(45).max(140),
    tags: z.array(z.string().trim().min(1).max(12)).min(2).max(4),
  })).length(5),
});
