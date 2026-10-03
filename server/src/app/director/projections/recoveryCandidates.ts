import type { RecoverableTaskListResponse } from "@ai-novel/shared/types/task";

type RecoveryProjectionPorts = {
  findTask: (id: string) => Promise<{ lane: string; novelId: string | null } | null>;
  findPipelineOwner: (id: string) => Promise<string | null>;
};

/** Project navigation only; never resume a task or parse historical planning state. */
export async function projectDirectorRecoveryCandidates(
  data: RecoverableTaskListResponse,
  ports: RecoveryProjectionPorts,
): Promise<RecoverableTaskListResponse> {
  const items = await Promise.all(data.items.map(async (item) => {
    if (item.kind === "novel_workflow") {
      const task = await ports.findTask(item.id);
      if (task?.lane !== "auto_director") return item;
      return {
        ...item,
        sourceRoute: task.novelId
          ? '/lab/director/' + encodeURIComponent(task.novelId)
          : '/novels/auto-director?taskId=' + encodeURIComponent(item.id),
        resumeAction: task.novelId ? "打开小说导演台" : "打开开书页面",
      };
    }
    if (item.kind === "novel_pipeline") {
      const novelId = await ports.findPipelineOwner(item.id);
      if (novelId) return { ...item, sourceRoute: '/lab/director/' + encodeURIComponent(novelId), resumeAction: "打开小说导演台" };
    }
    return item;
  }));
  return { ...data, items };
}
