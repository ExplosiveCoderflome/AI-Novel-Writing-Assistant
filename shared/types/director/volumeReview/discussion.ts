import { z } from "zod";
import { volumeReviewFields } from "../revision.js";
import { fieldSuggestionSchemas } from "../review/fieldSuggestions.js";

export const volumeFieldLabels = {
  summary: "本卷故事", mainPromise: "读者期待", climax: "本卷高潮", nextVolumeHook: "下卷引线",
} as const;
export const volumeDraftSchema = z.object({
  summary: z.string(), mainPromise: z.string(), climax: z.string(), nextVolumeHook: z.string(),
}).strict();
export type VolumeDraft = z.infer<typeof volumeDraftSchema>;
export const { reply: volumeReplySchema, changes: volumeProposalChanges } = fieldSuggestionSchemas(volumeReviewFields);
