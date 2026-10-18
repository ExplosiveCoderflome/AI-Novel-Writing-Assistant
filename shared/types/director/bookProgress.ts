/** Book-wide saved prose coverage, independent of an opening task or batch completion. */
export interface NovelBookProgress {
  writtenChapters: number;
  targetChapters: number | null;
  director: {
    runId: string;
    status: "queued" | "running" | "waiting_gate" | "paused" | "completed" | "failed" | "cancelled";
  } | null;
}
