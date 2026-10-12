export type CharacterCandidateAction = "create" | "merge" | "ignore";
export interface DirectorCharacterCandidateItem {
  id: string;
  name: string;
  role: string | null;
  summary: string | null;
  evidence: string[];
  recommendation: CharacterCandidateAction | "defer";
  reason: string;
  targetId: string | null;
  status: "pending" | "created" | "merged" | "ignored";
}
export interface DirectorCharacterCandidateReview {
  id: string;
  revision: number;
  chapterId: string;
  chapterOrder: number;
  contentHash: string;
  blocking: boolean;
  items: DirectorCharacterCandidateItem[];
}
export interface DirectorCharacterCandidatePage {
  editable: boolean;
  reviews: DirectorCharacterCandidateReview[];
  characters: {id: string; name: string}[];
}
export interface ResolveDirectorCharacterCandidates {
  reviewId: string;
  revision: number;
  contentHash: string;
  decisions: {candidateId: string; action: CharacterCandidateAction; targetId?: string}[];
}
