import {z} from "zod";

/** Explicit per-chapter confirmation, carried by the idempotent resume command, that
 *  model steps whose outcome could not be confirmed may be re-executed. */
export const directorUnknownClaimResolutionSchema = z.object({
  chapterId: z.string().trim().min(1),
}).strict();
export type DirectorUnknownClaimResolution = z.infer<typeof directorUnknownClaimResolutionSchema>;

/** Read-only view of a paused chapter with model steps awaiting that confirmation. */
export interface DirectorUnknownClaimsView {
  chapterId: string;
  chapterOrder: number;
}
