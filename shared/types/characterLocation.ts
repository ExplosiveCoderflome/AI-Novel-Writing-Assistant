import { z } from "zod";

/** AI determines story-time semantics; consumers validate identity and evidence. */
export const characterLocationDeltaSchema = z.object({
  characterId: z.string().trim().min(1),
  characterName: z.string().trim().min(1),
  fromLocation: z.string().trim().min(1).nullable().optional(),
  locationName: z.string().trim().min(1).nullable(),
  movementType: z.enum(["stay", "move", "reported", "uncertain"]),
  timeContext: z.enum(["present", "flashback", "dream", "plan", "hearsay"]),
  continuityStatus: z.enum(["consistent", "unexplained", "conflicting"]),
  evidence: z.string().trim().min(1),
  explanation: z.string().trim().nullable().optional(),
});
export type CharacterLocationDelta = z.infer<typeof characterLocationDeltaSchema>;

export const characterLocationStateSchema = z.object({
  currentLocation: z.string().nullable(),
  source: z.enum(["chapter", "profile", "unknown"]),
  sourceChapterId: z.string().nullable(),
  sourceChapterOrder: z.number().int().nullable(),
  contentHash: z.string().nullable(),
  evidence: z.string().nullable(),
  concern: z.string().nullable(),
});
export type CharacterLocationState = z.infer<typeof characterLocationStateSchema>;

export const characterLocationProjectionSchema = z.object({
  schemaVersion: z.literal(1),
  novelId: z.string().min(1),
  chapterId: z.string().min(1),
  chapterOrder: z.number().int(),
  contentHash: z.string().min(1),
  contentProvenance: z.enum(["confirmed", "debt"]).default("confirmed"),
  records: z.array(z.object({
    characterId: z.string().min(1),
    locationName: z.string().nullable(),
    evidence: z.string().nullable(),
    concern: z.string().nullable(),
  })),
});
export type CharacterLocationProjection = z.infer<typeof characterLocationProjectionSchema>;
