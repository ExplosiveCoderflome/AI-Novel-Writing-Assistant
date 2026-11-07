import type { DirectorVersion } from "@ai-novel/shared/types/director/version";

/** The saved task version owns recovery, including tasks created before a book exists. */
export function usesOpeningRetry(task: { resumeTarget?: { novelId?: string | null } | null; meta?: Record<string, unknown> } | null | undefined,
  selectedVersion: DirectorVersion): boolean {
  return !task?.resumeTarget?.novelId && (task?.meta?.directorVersion ?? selectedVersion) === "v2";
}
