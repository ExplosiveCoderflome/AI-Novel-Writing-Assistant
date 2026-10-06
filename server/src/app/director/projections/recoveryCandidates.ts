import type { RecoverableTaskListResponse } from "@ai-novel/shared/types/task";
import {readNovelDirectorIdentity} from "../../../modules/novel/director-routing";

type RecoveryProjectionPorts = {
  findTask: (id: string) => Promise<{ lane: string; novelId: string | null } | null>;
  findPipelineOwner: (id: string) => Promise<string | null>;
  readSourceRoute?: (novelId: string) => Promise<string>;
};

/** Project navigation only; never resume a task or parse historical planning state. */
export async function projectDirectorRecoveryCandidates(
  data: RecoverableTaskListResponse,
  ports: RecoveryProjectionPorts,
): Promise<RecoverableTaskListResponse> {
  const source = ports.readSourceRoute ?? (async id => (await readNovelDirectorIdentity(id)).sourceRoute);
  const items = await Promise.all(data.items.map(async (item) => {
    if (item.kind === "novel_workflow") {
      const task = await ports.findTask(item.id);
      if (task?.lane !== "auto_director") return item;
      return {
        ...item,
        sourceRoute: task.novelId
          ? await source(task.novelId)
          : '/novels/auto-director?taskId=' + encodeURIComponent(item.id),
        resumeAction: task.novelId ? "打开小说导演台" : "打开开书页面",
      };
    }
    if (item.kind === "novel_pipeline") {
      const novelId = await ports.findPipelineOwner(item.id);
      if (novelId) return { ...item, sourceRoute: await source(novelId), resumeAction: "打开小说导演台" };
    }
    return item;
  }));
  return { ...data, items };
}
