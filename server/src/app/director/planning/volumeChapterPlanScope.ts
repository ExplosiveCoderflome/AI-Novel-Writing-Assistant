import type {Prisma} from "@prisma/client";

/** Persisted chapter routes belong to one of these saved, writable volume states. */
export const DIRECTOR_PLANNED_VOLUME_STATUSES = [
  "active",
  "chapter_list_partial",
  "chapter_list_generated",
  "chapter_list_partial:active",
  "chapter_list_partial:chapter_list_generated",
] as const;

export function directorVolumeChapterPlanFilter(novelId:string):Prisma.VolumePlanWhereInput {
  return {novelId,status:{in:[...DIRECTOR_PLANNED_VOLUME_STATUSES]}};
}
