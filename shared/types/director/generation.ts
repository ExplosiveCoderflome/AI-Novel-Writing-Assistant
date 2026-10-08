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

/** Read-only workspace navigation, projected by V2 from the current run and saved artifact versions. */
export interface DirectorWorkspaceActivity {
  novelId: string;
  runId: string;
  revision: string;
  focus: {key: string; artifactType: string; label: string; volumeId?: string; chapterOrder?: number} | null;
}
