import type {
  NovelWorkflowCheckpoint,
  NovelWorkflowStage,
} from "@ai-novel/shared/types/novelWorkflow";
import type { TaskStatus } from "@ai-novel/shared/types/task";
import { syncNovelWorkflowStage } from "@/api/novelWorkflow";

export function workflowStageFromTab(tab: string): NovelWorkflowStage {
  if (tab === "story_macro") {
    return "story_macro";
  }
  if (tab === "character") {
    return "character_setup";
  }
  if (tab === "outline") {
    return "volume_strategy";
  }
  if (tab === "structured") {
    return "structured_outline";
  }
  if (tab === "chapter") {
    return "chapter_execution";
  }
  if (tab === "pipeline") {
    return "quality_repair";
  }
  return "project_setup";
}

export async function syncNovelWorkflowStageSilently(payload: {
  novelId: string;
  stage: NovelWorkflowStage;
  itemLabel: string;
  itemKey?: string;
  checkpointType?: NovelWorkflowCheckpoint | null;
  checkpointSummary?: string;
  chapterId?: string;
  volumeId?: string;
  progress?: number;
  status?: TaskStatus;
}): Promise<void> {
  try {
    await syncNovelWorkflowStage(payload);
  } catch {
    // keep the writing flow resilient even if task-center sync fails
  }
}
