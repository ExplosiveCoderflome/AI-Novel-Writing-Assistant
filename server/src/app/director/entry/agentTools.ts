import {prisma} from "../../../db/prisma";
import {configureAgentToolEntryBoundary} from "../../../agents/toolRegistry";
import {AgentToolError, type AgentToolName} from "../../../agents/types";
import {canExecuteLegacyTask, readNovelDirectorIdentity} from "../../../modules/novel/director-routing";

const legacyRuntimeTools: readonly AgentToolName[] = [
  "analyze_director_workspace", "get_director_run_status", "explain_director_next_action",
  "run_director_next_step", "run_director_until_gate", "switch_director_policy", "evaluate_manual_edit_impact",
];

/** The app owns entry switching; the director domain never imports legacy tools. */
export function configureDirectorAgentEntry(_enabled: boolean, ports: {
  readNovel?: typeof readNovelDirectorIdentity;
  canTask?: typeof canExecuteLegacyTask;
  readTask?: (taskId: string) => Promise<{novelId: string | null} | null>;
} = {}) {
  const readNovel = ports.readNovel ?? readNovelDirectorIdentity;
  const canTask = ports.canTask ?? canExecuteLegacyTask;
  const readTask = ports.readTask ?? (taskId => prisma.novelWorkflowTask.findUnique({where: {id: taskId}, select: {novelId: true}}));
  configureAgentToolEntryBoundary({
    unavailableTools: [],
    assertExecutionAllowed: async (name, context, input) => {
      if (!legacyRuntimeTools.includes(name)) return;
      const taskId = typeof input.taskId === "string" ? input.taskId.trim() : "";
      const task = taskId ? await readTask(taskId) : null;
      const novelId = task?.novelId || (typeof input.novelId === "string" ? input.novelId.trim() : "") || context.novelId;
      if (taskId && await canTask(taskId)) return;
      if (!taskId && novelId && (await readNovel(novelId)).version === "v1") return;
      if (!taskId && !novelId) return;
      const route = novelId ? `/lab/director/${encodeURIComponent(novelId)}`
        : taskId ? `/novels/auto-director?taskId=${encodeURIComponent(taskId)}` : "/lab/director";
      throw new AgentToolError("CONFLICT", `请打开小说导演台，选择创作范围后继续。 ${route}`);
    },
  });
}
