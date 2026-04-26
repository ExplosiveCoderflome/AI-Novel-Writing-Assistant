type DirectorDialogMode = "candidate_selection" | "execution_progress" | "execution_failed";

interface NovelAutoDirectorDialogHeaderProps {
  mode: DirectorDialogMode;
}

export function NovelAutoDirectorDialogTitle({ mode }: NovelAutoDirectorDialogHeaderProps) {
  if (mode === "candidate_selection") {
    return "AI 自动导演创建";
  }
  if (mode === "execution_failed") {
    return "AI 自动导演执行失败";
  }
  return "AI 自动导演执行中";
}

export function NovelAutoDirectorDialogDescription({ mode }: NovelAutoDirectorDialogHeaderProps) {
  if (mode === "candidate_selection") {
    return "先补导演起始设置，再让 AI 给你 2 套整本书方向。你可以继续重生新批次，也可以只修某一套方案或它的标题组。";
  }
  if (mode === "execution_failed") {
    return "导演长流程已中断，当前会优先显示失败摘要、最近里程碑和恢复入口。";
  }
  return "当前会实时显示导演主流程进度、当前动作和里程碑历史。";
}

export type { DirectorDialogMode };
