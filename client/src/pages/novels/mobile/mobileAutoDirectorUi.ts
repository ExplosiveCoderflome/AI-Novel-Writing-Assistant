import type { AITakeoverMode } from "@/components/workflow/AITakeoverContainer";

export function getMobileAutoDirectorModeLabel(mode: AITakeoverMode): string {
  switch (mode) {
    case "running":
      return "接管中";
    case "waiting":
      return "待确认";
    case "action_required":
      return "待处理";
    case "failed":
      return "异常";
    case "loading":
    default:
      return "加载中";
  }
}

export function getMobileAutoDirectorStickyLabel(input: {
  title: string;
  currentAction?: string | null;
  description?: string | null;
}): string {
  const currentAction = input.currentAction?.trim();
  if (currentAction) {
    return currentAction;
  }
  const description = input.description?.trim();
  if (description) {
    return description;
  }
  return input.title;
}

export function shouldShowMobileAutoDirectorProgress(progress: number | null | undefined): progress is number {
  return typeof progress === "number";
}
