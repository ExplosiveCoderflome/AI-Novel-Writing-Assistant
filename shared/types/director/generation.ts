/** Ephemeral read-only preview. It is never a checkpoint or a saved chapter. */
export interface DirectorGenerationSnapshot {
  novelId: string;
  chapterId: string;
  chapterOrder: number;
  chapterTitle: string;
  executionId: string;
  revision: number;
  state: "writing" | "checking" | "saved" | "interrupted";
  content: string;
  updatedAt: number;
}
