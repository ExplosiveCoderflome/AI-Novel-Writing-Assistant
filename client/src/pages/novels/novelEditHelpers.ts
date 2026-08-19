import type { DirectorDashboardMode, DirectorTaskSnapshot } from "@ai-novel/shared/types/directorRuntime";
import type { DirectorLockScope } from "@ai-novel/shared/types/novelDirector";
import type { ChapterExecutionBackgroundActivity } from "./components/chapterExecution.shared";
import type { NovelEditTakeoverState } from "./components/NovelEditView.types";
import { scopeFromWorkspaceTab } from "./novelWorkspaceNavigation";

export function mapDashboardModeToTakeoverMode(mode: DirectorDashboardMode | null | undefined): NovelEditTakeoverState["mode"] | null {
  switch (mode) {
    case "running":
    case "queued":
    case "completed":
      return "running";
    case "waiting_user":
      return "waiting";
    case "recovering":
      return "action_required";
    case "failed":
      return "failed";
    case "idle":
      return "loading";
    default:
      return null;
  }
}

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

export function createDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function scopeFromTab(tab: string): DirectorLockScope | null {
  return scopeFromWorkspaceTab(tab);
}

export function resolveDirectorConsistencyIssue(input: {
  checkpointType: string | null | undefined;
  characterCount: number;
  chapterCount: number;
}): "missing_characters" | "missing_chapters" | null {
  if (input.checkpointType !== "chapter_batch_ready") {
    return null;
  }
  if (input.characterCount === 0) {
    return "missing_characters";
  }
  if (input.chapterCount === 0) {
    return "missing_chapters";
  }
  return null;
}

export function takeoverDismissStorageKey(novelId: string): string {
  return `novel-edit:takeover-dismissed:${novelId}`;
}

export function resolveActiveStructuredOutlineChapterId(snapshot: DirectorTaskSnapshot | null): string {
  if (!snapshot) {
    return "";
  }
  const activeRuntimeStep = snapshot.runtime?.steps.find((step) => (
    step.idempotencyKey === snapshot.activeStep?.idempotencyKey
  ));
  if (
    activeRuntimeStep?.nodeKey === "structured_outline.chapter_detail_bundle"
    && activeRuntimeStep.targetType === "chapter"
    && activeRuntimeStep.targetId?.trim()
  ) {
    return activeRuntimeStep.targetId.trim();
  }
  const latestStructuredChapterStep = [...(snapshot.runtime?.steps ?? [])].reverse().find((step) => (
    step.nodeKey === "structured_outline.chapter_detail_bundle"
    && step.status === "running"
    && step.targetType === "chapter"
    && step.targetId?.trim()
  ));
  return latestStructuredChapterStep?.targetId?.trim() ?? "";
}
