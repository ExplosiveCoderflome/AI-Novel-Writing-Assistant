import type { FailureDiagnostic } from "@ai-novel/shared/types/agent";
import type {
  CreativeHubInterrupt,
  CreativeHubNovelSetupStatus,
  CreativeHubProductionStatus,
  CreativeHubThread,
  CreativeHubTurnSummary,
} from "@ai-novel/shared/types/creativeHub";
import type { WorkspaceTone } from "@/components/workspace";

export type CreativeHubWorkspaceAction =
  | "retry_threads"
  | "retry_state"
  | "retry_thread"
  | "retry_novels"
  | "retry_create_thread"
  | "review_interrupt"
  | "view_activity"
  | "send_prompt"
  | "select_novel"
  | "open_production";

export interface CreativeHubWorkspaceRecommendation {
  tone: WorkspaceTone;
  title: string;
  description: string;
  action: CreativeHubWorkspaceAction;
  actionLabel: string;
  prompt?: string;
}

export interface CreativeHubWorkspacePresentation {
  objectTitle: string;
  stageLabel: string;
  threadStatusLabel: string;
  recommendation: CreativeHubWorkspaceRecommendation;
}

export function formatCreativeHubThreadStatus(
  status: CreativeHubThread["status"] | undefined,
): string {
  if (status === "busy") return "执行中";
  if (status === "interrupted") return "等待确认";
  if (status === "error") return "运行异常";
  if (status === "idle") return "等待指令";
  return "正在初始化";
}

function formatSetupStage(stage: CreativeHubNovelSetupStatus["stage"] | undefined): string | null {
  if (stage === "setup_in_progress") return "补齐开书信息";
  if (stage === "ready_for_planning") return "准备故事规划";
  if (stage === "ready_for_production") return "准备整本生产";
  return null;
}

function errorText(value: unknown, fallback: string): string | null {
  if (!value) return null;
  if (value instanceof Error && value.message.trim()) return value.message.trim();
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
}

export function resolveCreativeHubWorkspacePresentation(input: {
  thread?: CreativeHubThread | null;
  currentNovelTitle?: string | null;
  interrupt?: CreativeHubInterrupt | null;
  isRunning: boolean;
  diagnostics?: FailureDiagnostic | null;
  productionStatus?: CreativeHubProductionStatus | null;
  novelSetup?: CreativeHubNovelSetupStatus | null;
  latestTurnSummary?: CreativeHubTurnSummary | null;
  threadsError?: unknown;
  stateError?: unknown;
  threadLoadError?: unknown;
  novelsError?: unknown;
  createThreadError?: unknown;
}): CreativeHubWorkspacePresentation {
  const objectTitle = input.currentNovelTitle?.trim()
    || input.productionStatus?.title?.trim()
    || input.novelSetup?.title?.trim()
    || "未绑定小说";
  const stageLabel = input.latestTurnSummary?.currentStage?.trim()
    || input.productionStatus?.currentStage?.trim()
    || formatSetupStage(input.novelSetup?.stage)
    || "等待创作目标";
  const threadStatusLabel = formatCreativeHubThreadStatus(input.thread?.status);

  const threadsError = errorText(input.threadsError, "创作线程加载失败。");
  if (threadsError) {
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "danger",
        title: "重新加载创作线程",
        description: `${threadsError} 已保存的小说和线程内容不会被修改。`,
        action: "retry_threads",
        actionLabel: "重新加载线程",
      },
    };
  }

  const createThreadError = errorText(input.createThreadError, "创作线程创建失败。");
  if (createThreadError) {
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "danger",
        title: "重新创建创作线程",
        description: `${createThreadError} 已有小说和创作资料不会被修改。`,
        action: "retry_create_thread",
        actionLabel: "重新创建线程",
      },
    };
  }

  const stateError = errorText(input.stateError, "线程状态加载失败。")
    || errorText(input.threadLoadError, "线程内容加载失败。");
  if (stateError) {
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "danger",
        title: "重新加载当前创作现场",
        description: `${stateError} 为避免混淆，旧线程内容不会继续显示。`,
        action: input.threadLoadError ? "retry_thread" : "retry_state",
        actionLabel: "重新加载当前线程",
      },
    };
  }

  const novelsError = errorText(input.novelsError, "小说列表加载失败。");
  if (novelsError) {
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "danger",
        title: "重新加载小说列表",
        description: `${novelsError} 当前线程内容仍会保留。`,
        action: "retry_novels",
        actionLabel: "重新加载小说",
      },
    };
  }

  if (input.interrupt) {
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "warning",
        title: input.interrupt.title || "处理待确认的创作操作",
        description: input.interrupt.summary || "本轮执行正在等待你的确认，处理后才能继续当前动作。",
        action: "review_interrupt",
        actionLabel: "查看待确认项",
      },
    };
  }

  if (input.thread?.status === "interrupted" || input.latestTurnSummary?.status === "interrupted") {
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "warning",
        title: "查看待确认的创作操作",
        description: input.latestTurnSummary?.nextSuggestion?.trim()
          || "当前线程仍在等待确认，请先查看执行记录中的待确认项。",
        action: "view_activity",
        actionLabel: "查看待确认项",
      },
    };
  }

  if (input.isRunning || input.thread?.status === "busy") {
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "info",
        title: "AI 正在推进当前创作目标",
        description: `当前阶段：${stageLabel}。执行记录、工具结果和需要确认的事项会持续显示在主工作区。`,
        action: "view_activity",
        actionLabel: "查看执行记录",
      },
    };
  }

  const failedTurn = input.latestTurnSummary?.status === "failed"
    ? input.latestTurnSummary
    : null;
  const failureSummary = input.diagnostics?.failureSummary?.trim()
    || input.productionStatus?.failureSummary?.trim()
    || input.thread?.latestError?.trim()
    || failedTurn?.impactSummary?.trim()
    || (input.thread?.status === "error" ? "当前创作线程处于异常状态。" : null);
  if (failureSummary) {
    const recoveryHint = input.diagnostics?.recoveryHint?.trim()
      || input.productionStatus?.recoveryHint?.trim()
      || failedTurn?.nextSuggestion?.trim()
      || "分析当前失败原因并给出安全恢复步骤";
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "danger",
        title: "处理当前创作阻塞",
        description: `${failureSummary} 恢复操作会继续使用现有小说资产和任务记录。`,
        action: "send_prompt",
        actionLabel: "生成恢复方案",
        prompt: recoveryHint,
      },
    };
  }

  if (input.novelSetup && input.novelSetup.stage !== "ready_for_production") {
    const prompt = input.novelSetup.recommendedAction?.trim()
      || input.novelSetup.nextQuestion?.trim();
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "warning",
        title: "继续补齐开书信息",
        description: input.novelSetup.nextQuestion?.trim()
          || "先补齐影响后续规划的关键信息，再进入整本生产。",
        action: prompt ? "send_prompt" : "open_production",
        actionLabel: prompt ? "按 AI 建议继续" : "查看开书准备",
        ...(prompt ? { prompt } : {}),
      },
    };
  }

  const nextSuggestion = input.latestTurnSummary?.nextSuggestion?.trim();
  if (nextSuggestion) {
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "info",
        title: "继续当前创作目标",
        description: nextSuggestion,
        action: "send_prompt",
        actionLabel: "按建议继续",
        prompt: nextSuggestion,
      },
    };
  }

  if (objectTitle === "未绑定小说") {
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "info",
        title: "选择本轮要推进的小说",
        description: "绑定小说后，AI 才能读取对应的章节、世界、角色和生产状态。",
        action: "select_novel",
        actionLabel: "选择小说",
      },
    };
  }

  return {
    objectTitle,
    stageLabel,
    threadStatusLabel,
    recommendation: {
      tone: "neutral",
      title: "说明本轮要推进的创作目标",
      description: "可以补充作品问题、调整要求，或打开整本生产设置继续现有小说。",
      action: "open_production",
      actionLabel: "查看生产入口",
    },
  };
}
