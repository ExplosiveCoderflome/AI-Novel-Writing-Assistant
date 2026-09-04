import { z } from "zod";
import { DIRECTOR_IDEA_CONSTELLATION_CATEGORIES } from "@ai-novel/shared/types/novelDirector";

export const directorIdeaConstellationOptionSchema = z.object({
  id: z.string().trim().min(1).max(48),
  category: z.enum(DIRECTOR_IDEA_CONSTELLATION_CATEGORIES),
  label: z.string().trim().min(2).max(48),
  hint: z.string().trim().min(4).max(64),
  relevance: z.enum(["high", "medium", "low"]),
}).strict();

export const directorIdeaConstellationOptionsSchema = z.object({
  options: z.array(directorIdeaConstellationOptionSchema).length(35),
}).strict().superRefine((output, context) => {
  const ids = new Set(output.options.map((option) => option.id));
  if (ids.size !== output.options.length) {
    context.addIssue({ code: "custom", message: "故事星图选项 id 不能重复。" });
  }
  for (const category of DIRECTOR_IDEA_CONSTELLATION_CATEGORIES) {
    const count = output.options.filter((option) => option.category === category).length;
    if (count !== 5) {
      context.addIssue({ code: "custom", message: `故事星图类别 ${category} 必须正好包含 5 项。` });
    }
  }
});

export const directorIdeaConstellationComposeSchema = z.object({
  idea: z.string().trim().min(45).max(220),
}).strict();
