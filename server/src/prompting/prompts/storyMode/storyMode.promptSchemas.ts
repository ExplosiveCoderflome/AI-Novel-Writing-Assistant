import { z } from "zod";
import { storyModeProfileSchema } from "../../../services/storyMode/storyModeProfile";

export interface StoryModeDraftNode {
  name: string;
  description?: string;
  template?: string;
  profile: z.infer<typeof storyModeProfileSchema>;
  children: StoryModeDraftNode[];
}

export const storyModeDraftNodeSchema: z.ZodType<StoryModeDraftNode> = z.lazy(() => z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(400).optional(),
  template: z.string().trim().max(4000).optional(),
  profile: storyModeProfileSchema,
  children: z.array(storyModeDraftNodeSchema).max(12).default([]),
}));

export const storyModeChildDraftNodeSchema = z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(400).optional(),
  template: z.string().trim().max(4000).optional(),
  profile: storyModeProfileSchema,
  children: z.array(z.unknown()).max(0).default([]),
});

export const storyModeChildDraftListSchema = z.array(storyModeChildDraftNodeSchema)
  .min(1)
  .max(5);
