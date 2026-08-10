import i18next from "i18next";
import type { FailureDiagnostic } from "@ai-novel/shared/types/agent";
import type {
  CreativeHubInterrupt,
  CreativeHubNovelSetupStatus,
  CreativeHubProductionStatus,
  CreativeHubThread,
  CreativeHubTurnSummary,
} from "@ai-novel/shared/types/creativeHub";
import type { WorkspaceTone } from "@/components/workspace";

export type CreativeHubWorkspaceActionKind =
  | "retry_threads"
  | "retry_thread"
  | "retry_create_thread"
  | "retry_state"
  | "retry_novels"
  | "focus_interrupt"
  | "focus_running"
  | "generate_recovery"
  | "continue_setup_prompt"
  | "view_setup"
  | "continue_target"
  | "select_novel"
  | "view_production_entry"
  | "send_prompt"
  | "open_production"
  | "review_interrupt"
  | "view_activity";

export interface CreativeHubWorkspaceRecommendation {
  tone: WorkspaceTone;
  title: string;
  description: string;
  action: CreativeHubWorkspaceActionKind;
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
  if (status === "busy") return i18next.t("creativeHub.statusBusy", "执行中");
  if (status === "interrupted") return i18next.t("creativeHub.statusInterrupted", "等待确认");
  if (status === "error") return i18next.t("creativeHub.statusError", "运行异常");
  if (status === "idle") return i18next.t("creativeHub.statusIdle", "等待指令");
  return i18next.t("creativeHub.statusInitializing", "正在初始化");
}

function formatSetupStage(stage: CreativeHubNovelSetupStatus["stage"] | undefined): string | null {
  if (stage === "setup_in_progress") return i18next.t("creativeHub.stageSetup", "补齐开书信息");
  if (stage === "ready_for_planning") return i18next.t("creativeHub.stagePlanning", "准备故事规划");
  if (stage === "ready_for_production") return i18next.t("creativeHub.stageProduction", "准备整本生产");
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
    || i18next.t("creativeHub.unboundNovel", "未绑定小说");
  const stageLabel = input.latestTurnSummary?.currentStage?.trim()
    || input.productionStatus?.currentStage?.trim()
    || formatSetupStage(input.novelSetup?.stage)
    || i18next.t("creativeHub.waitingTarget", "等待创作目标");
  const threadStatusLabel = formatCreativeHubThreadStatus(input.thread?.status);

  const threadsError = errorText(input.threadsError, i18next.t("creativeHub.errThreadLoadFailed", "创作线程加载失败。"));
  if (threadsError) {
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "danger",
        title: i18next.t("creativeHub.titleReloadThreads", "重新加载创作线程"),
        description: `${threadsError} ${i18next.t("creativeHub.descReloadThreads", "已保存的小说和线程内容不会被修改。")}`,
        action: "retry_threads",
        actionLabel: i18next.t("creativeHub.actionReloadThreads", "重新加载线程"),
      },
    };
  }

  const createThreadError = errorText(input.createThreadError, i18next.t("creativeHub.errThreadCreateFailed", "创作线程创建失败。"));
  if (createThreadError) {
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "danger",
        title: i18next.t("creativeHub.titleRecreateThread", "重新创建创作线程"),
        description: `${createThreadError} ${i18next.t("creativeHub.descRecreateThread", "已有小说和创作资料不会被修改。")}`,
        action: "retry_create_thread",
        actionLabel: i18next.t("creativeHub.actionRecreateThread", "重新创建线程"),
      },
    };
  }

  const stateError = errorText(input.stateError, i18next.t("creativeHub.errStateLoadFailed", "线程状态加载失败。"))
    || errorText(input.threadLoadError, i18next.t("creativeHub.errThreadLoadFailed", "线程内容加载失败。"));
  if (stateError) {
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "danger",
        title: i18next.t("creativeHub.titleReloadWorkspace", "重新加载当前创作现场"),
        description: `${stateError} ${i18next.t("creativeHub.descReloadWorkspace", "为避免混淆，旧线程内容不会继续显示。")}`,
        action: "retry_state",
        actionLabel: i18next.t("creativeHub.actionReloadWorkspace", "重新加载当前线程"),
      },
    };
  }

  const novelsError = errorText(input.novelsError, i18next.t("creativeHub.errNovelLoadFailed", "小说列表加载失败。"));
  if (novelsError) {
    return {
      objectTitle,
      stageLabel,
      threadStatusLabel,
      recommendation: {
        tone: "danger",
        title: i18next.t("creativeHub.titleReloadNovels", "重新加载小说列表"),
        description: `${novelsError} ${i18next.t("creativeHub.descReloadNovels", "当前线程内容仍会保留。")}`,
        action: "retry_novels",
        actionLabel: i18next.t("creativeHub.actionReloadNovels", "重新加载小说"),
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
        title: input.interrupt.title || i18next.t("creativeHub.titleHandleInterrupt", "处理待确认的创作操作"),
        description: input.interrupt.summary || i18next.t("creativeHub.descHandleInterrupt", "本轮执行正在等待你的确认，处理后才能继续当前动作。"),
        action: "focus_interrupt",
        actionLabel: i18next.t("creativeHub.actionViewInterrupt", "查看待确认项"),
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
        title: i18next.t("creativeHub.titleSelectNovel"),
        description: i18next.t("creativeHub.descSelectNovel"),
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
      title: i18next.t("creativeHub.titleSpecifyTarget"),
      description: i18next.t("creativeHub.descSpecifyTarget"),
      action: "open_production",
      actionLabel: "查看生产入口",
    },
  };
}
