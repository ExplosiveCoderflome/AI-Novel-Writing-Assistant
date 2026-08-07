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
  if (status === "busy") return "Executing";
  if (status === "interrupted") return "Waiting for confirmation";
  if (status === "error") return "Abnormal operation";
  if (status === "idle") return "Waiting for instructions";
  return "Initializing";
}

function formatSetupStage(stage: CreativeHubNovelSetupStatus["stage"] | undefined): string | null {
  if (stage === "setup_in_progress") return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  if (stage === "ready_for_planning") return "Prepare story plan";
  if (stage === "ready_for_production") return "Prepare for full production";
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
    || "Unbound novel";
  const stageLabel = input.latestTurnSummary?.currentStage?.trim()
    || input.productionStatus?.currentStage?.trim()
    || formatSetupStage(input.novelSetup?.stage)
    || "Waiting for creation target";
  const threadStatusLabel = formatCreativeHubThreadStatus(input.thread?.status);

  const threadsError = errorText(input.threadsError, "The authoring thread failed to load.");
  if (threadsError) {
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "danger",
        title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
        description: `${threadsError} Saved novel and thread content will not be modified.`,
        action: "retry_threads",
        actionLabel: "reload thread",
      },
    };
  }

  const createThreadError = errorText(input.createThreadError, "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.");
  if (createThreadError) {
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "danger",
        title: "Recreate the authoring thread",
        description: `${createThreadError} Existing novels and creative materials will not be modified.`,
        action: "retry_create_thread",
        actionLabel: "Re-create the thread",
      },
    };
  }

  const stateError = errorText(input.stateError, "Thread state loading failed.")
    || errorText(input.threadLoadError, "Thread content loading failed.");
  if (stateError) {
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "danger",
        title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
        description: `To avoid confusion, the old thread's content will not be displayed in ${stateError}.`,
        action: input.threadLoadError ? "retry_thread" : "retry_state",
        actionLabel: "Reload the current thread",
      },
    };
  }

  const novelsError = errorText(input.novelsError, "The novel list failed to load.");
  if (novelsError) {
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "danger",
        title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
        description: `${novelsError} The content of the current thread will still be preserved.`,
        action: "retry_novels",
        actionLabel: "reload novel",
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
        title: input.interrupt.title || "Handle pending authoring operations",
        description: input.interrupt.summary || "This round of execution is waiting for your confirmation before the current action can be continued.",
        action: "review_interrupt",
        actionLabel: "View pending items",
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
        title: "View pending authoring actions",
        description: input.latestTurnSummary?.nextSuggestion?.trim()
          || "The current thread is still waiting for confirmation. Please check the pending items in the execution record first.",
        action: "view_activity",
        actionLabel: "View pending items",
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
        title: "AI is driving current creative goals",
        description: `当前阶段：${stageLabel}。执行记录、工具结果和需要确认的事项会持续显示在主工作区。`,
        action: "view_activity",
        actionLabel: "View execution records",
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
    || (input.thread?.status === "error" ? "The current authoring thread is in an abnormal state." : null);
  if (failureSummary) {
    const recoveryHint = input.diagnostics?.recoveryHint?.trim()
      || input.productionStatus?.recoveryHint?.trim()
      || failedTurn?.nextSuggestion?.trim()
      || "Analyze the current failure reasons and provide safe recovery steps";
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "danger",
        title: "Handle current creative block",
        description: `The ${failureSummary} recovery operation will continue to use existing novel assets and quest records.`,
        action: "send_prompt",
        actionLabel: "Generate recovery plan",
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
        title: "Continue to complete the book opening information",
        description: input.novelSetup.nextQuestion?.trim()
          || "First complete the key information that affects subsequent planning, and then enter the entire production.",
        action: prompt ? "send_prompt" : "open_production",
        actionLabel: prompt ? "Continue with AI suggestions" : "View preparations for book opening",
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
        title: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
        description: nextSuggestion,
        action: "send_prompt",
        actionLabel: "Continue as suggested",
        prompt: nextSuggestion,
      },
    };
  }

  if (objectTitle === "Unbound novel") {
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "info",
        title: "Choose the novel to advance this round",
        description: "Only after binding the novel can the AI ​​read the corresponding chapters, worlds, characters and production status.",
        action: "select_novel",
        actionLabel: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      },
    };
  }

  return {
    objectTitle,
    stageLabel,
    threadStatusLabel,
    recommendation: {
      tone: "neutral",
      title: "Explain the creative goals to be promoted in this round",
      description: "You can add work questions, adjust requirements, or open the entire production setup to continue an existing novel.",
      action: "open_production",
      actionLabel: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    },
  };
}
