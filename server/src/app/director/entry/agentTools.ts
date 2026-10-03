import {prisma} from "../../../db/prisma";
import {configureAgentToolEntryBoundary} from "../../../agents/toolRegistry";
import {AgentToolError, type AgentToolName} from "../../../agents/types";

const legacyRuntimeTools: readonly AgentToolName[] = [
  "analyze_director_workspace", "get_director_run_status", "explain_director_next_action",
  "run_director_next_step", "run_director_until_gate", "switch_director_policy", "evaluate_manual_edit_impact",
];

/** The app owns entry switching; the director domain never imports legacy tools. */
export function configureDirectorAgentEntry(enabled: boolean) {
  configureAgentToolEntryBoundary(enabled ? {
    unavailableTools: legacyRuntimeTools,
    assertExecutionAllowed: async (name, context, input) => {
      if (!legacyRuntimeTools.includes(name)) return;
      const taskId = typeof input.taskId === "string" ? input.taskId.trim() : "";
      const task = taskId ? await prisma.novelWorkflowTask.findUnique({where: {id: taskId}, select: {novelId: true}}) : null;
      const novelId = task?.novelId || (typeof input.novelId === "string" ? input.novelId.trim() : "") || context.novelId;
      const route = novelId ? `/lab/director/${encodeURIComponent(novelId)}`
        : taskId ? `/novels/auto-director?taskId=${encodeURIComponent(taskId)}` : "/lab/director";
      throw new AgentToolError("CONFLICT", `请打开小说导演台，选择创作范围后继续。 ${route}`);
    },
  } : undefined);
}
