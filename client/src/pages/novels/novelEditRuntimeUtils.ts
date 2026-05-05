import type { ChapterExecutionBackgroundActivity } from "./components/chapterExecution.shared";

export function parsePipelineBackgroundActivities(payload: string | null | undefined): ChapterExecutionBackgroundActivity[] {
  if (!payload?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(payload) as {
      backgroundSync?: {
        activities?: Array<{
          kind?: unknown;
          status?: unknown;
          chapterId?: unknown;
          chapterOrder?: unknown;
          chapterTitle?: unknown;
          updatedAt?: unknown;
          error?: unknown;
        }>;
      };
    };
    return (parsed.backgroundSync?.activities ?? [])
      .flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }
        const kind = item.kind;
        const status = item.status;
        if (
          (kind !== "character_dynamics" && kind !== "state_snapshot" && kind !== "payoff_ledger" && kind !== "character_resources")
          || (status !== "running" && status !== "failed")
          || typeof item.chapterId !== "string"
          || !item.chapterId.trim()
          || typeof item.updatedAt !== "string"
          || !item.updatedAt.trim()
        ) {
          return [];
        }
        const activity: ChapterExecutionBackgroundActivity = {
          kind,
          status,
          chapterId: item.chapterId.trim(),
          chapterOrder: typeof item.chapterOrder === "number" ? item.chapterOrder : undefined,
          chapterTitle: typeof item.chapterTitle === "string" && item.chapterTitle.trim() ? item.chapterTitle.trim() : undefined,
          updatedAt: item.updatedAt.trim(),
          error: typeof item.error === "string" && item.error.trim() ? item.error.trim() : null,
        };
        return [activity];
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
