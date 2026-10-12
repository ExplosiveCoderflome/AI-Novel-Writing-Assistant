import type { CreativeHubMessage, CreativeHubThread } from "@ai-novel/shared/types/creativeHub";

const activeThreadIds = new Set<string>();

export function acquireCreativeHubThread(threadId: string): () => void {
  if (activeThreadIds.has(threadId)) {
    throw new Error("当前已有运行仍在执行中。");
  }
  activeThreadIds.add(threadId);
  return () => activeThreadIds.delete(threadId);
}

export function latestHumanGoal(messages: CreativeHubMessage[]): string {
  const latestHuman = [...messages].reverse().find((item) => item.type === "human");
  if (typeof latestHuman?.content === "string" && latestHuman.content.trim()) {
    return latestHuman.content.trim();
  }
  return "继续当前创作中枢任务。";
}

export function toRunStatusContext(status: CreativeHubThread["status"], latestError: string | null) {
  return {
    threadStatus: status,
    latestError,
  };
}
