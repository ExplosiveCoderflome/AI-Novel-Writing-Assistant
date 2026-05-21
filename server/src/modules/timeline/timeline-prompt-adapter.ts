import type { TimelineContextForChapter } from "@ai-novel/shared/types/timeline";

function listBlock<T>(title: string, items: T[], render: (item: T) => string): string {
  if (items.length === 0) {
    return `${title}\n- 无`;
  }
  return [title, ...items.map((item) => `- ${render(item)}`)].join("\n");
}

type TimelineContextHook = TimelineContextForChapter["openHooks"][number];

function resolveModeOf(hook: TimelineContextHook): TimelineContextHook["resolveMode"] {
  return hook.resolveMode ?? "long_arc";
}

function isBlockingHook(hook: TimelineContextHook): boolean {
  return (Boolean(hook.blocking) && resolveModeOf(hook) === "immediate")
    || (!hook.resolveMode && hook.priority === "critical");
}

function hookLabel(hook: TimelineContextHook): string {
  return `[id=${hook.id}] ${hook.title}：${hook.description}（${hook.priority} / ${resolveModeOf(hook)}）`;
}

export class TimelinePromptAdapter {
  toPromptBlock(context: TimelineContextForChapter): string {
    const blockingHooks = context.blockingHooks?.length
      ? context.blockingHooks
      : context.openHooks.filter(isBlockingHook);
    const blockingIds = new Set(blockingHooks.map((hook) => hook.id));
    const softHooks = context.softHooks?.length
      ? context.softHooks
      : context.openHooks.filter((hook) => !blockingIds.has(hook.id));
    const addressedHooks = context.addressedHooks ?? [];
    return [
      "【时间线约束】",
      `当前章节：第 ${context.currentChapterIndex} 章`,
      `当前故事时间：${context.currentTime?.label || "未明确"}`,
      "",
      listBlock("【已发生关键事件】", context.previousEvents, (event) =>
        `${event.title}：${event.summary}${event.storyTimeLabel ? `（${event.storyTimeLabel}）` : ""}`),
      "",
      listBlock("【本章必须推进】", context.plannedEventsThisChapter, (event) =>
        `${event.title}：${event.summary}`),
      "",
      listBlock("【必须立即承接的钩子】", blockingHooks, (hook) =>
        hookLabel(hook)),
      "",
      listBlock("【可延后承接的钩子】", softHooks, (hook) =>
        hookLabel(hook)),
      "",
      listBlock("【已部分承接的钩子】", addressedHooks, (hook) =>
        hookLabel(hook)),
      "",
      listBlock("【禁止提前发生】", context.forbiddenEvents, (event) =>
        `${event.title}：${event.reason}`),
      "",
      listBlock("【连续性要求】", context.continuityRequirements, (item) => item),
      "",
      listBlock("【关键状态变化】", context.knownStateChanges.slice(-8), (change) =>
        `${change.targetType}:${change.targetId}.${change.field} = ${change.after}（${change.certainty}）`),
    ].join("\n").trim();
  }

  toPreviousHookBlock(context: TimelineContextForChapter): string {
    const blockingHooks = context.blockingHooks?.length
      ? context.blockingHooks
      : context.openHooks.filter(isBlockingHook);
    const softHooks = context.softHooks ?? [];
    const hooks = blockingHooks.length > 0 ? blockingHooks : softHooks.slice(0, 4);
    const title = blockingHooks.length > 0
      ? "【上一章必须立即承接的钩子】"
      : "【上一章可延后承接的钩子】";
    return listBlock(title, hooks, (hook) =>
      `[id=${hook.id}] ${hook.title}：${hook.description}（优先级：${hook.priority} / ${resolveModeOf(hook)}）`);
  }
}

export const timelinePromptAdapter = new TimelinePromptAdapter();
