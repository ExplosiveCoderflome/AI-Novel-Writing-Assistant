import {z} from "zod";

export const characterAppearanceSchema = z.object({
  characterId: z.string().trim().nullish().transform(value => value ?? ""),
  characterName: z.string().trim().min(1),
  kind: z.enum(["present", "mention", "flashback", "dream"]),
  summary: z.string().trim().min(1).max(160),
  evidence: z.string().trim().min(1).max(350),
});
export type CharacterAppearance = z.infer<typeof characterAppearanceSchema>;

export interface CharacterAppearanceChapter {
  chapterId: string;
  chapterOrder: number;
  chapterTitle: string;
  planned: boolean;
  planSource?: "initial" | "task";
  coverage: "recorded" | "untracked" | "unwritten";
  events: CharacterAppearance[];
}

export interface DirectorCharacterAppearances {
  novelId: string;
  characterId: string;
  chapters: CharacterAppearanceChapter[];
}

/** Whole-cast projection: chapter metadata is shared, not repeated per character. */
export interface DirectorNovelCharacterAppearances {
  novelId: string;
  chapters: Array<Omit<CharacterAppearanceChapter, "planned"> & {plannedCharacterIds: string[]}>;
}

export interface InitialCharacterScheduleResult {updated:number;remaining:number}
