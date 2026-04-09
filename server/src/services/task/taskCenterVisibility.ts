import type { TaskStatus, UnifiedTaskSummary } from "@ai-novel/shared/types/task";

const WORKFLOW_PROXY_PIPELINE_STATUSES = new Set<TaskStatus>([
  "queued",
  "running",
  "waiting_approval",
  "succeeded",
]);

export function collectWorkflowLinkedPipelineIds(tasks: UnifiedTaskSummary[]): Set<string> {
  return new Set(
    tasks
      .filter((task) => task.kind === "novel_workflow" && WORKFLOW_PROXY_PIPELINE_STATUSES.has(task.status))
      .flatMap((task) =>
        (task.targetResources ?? [])
          .filter((resource) => resource.type === "generation_job")
          .map((resource) => resource.id)),
  );
}
