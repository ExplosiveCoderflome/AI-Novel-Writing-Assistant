import type { DirectorCommandResultResponse } from "@ai-novel/shared/types/directorRuntime";

export async function waitForCandidateResult<T extends {batch: unknown}>(
  read: () => Promise<{data?: DirectorCommandResultResponse<T> | null}>,
  signal: AbortSignal,
  wait: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 2000)),
): Promise<T> {
  for (;;) {
    signal.throwIfAborted();
    let command: DirectorCommandResultResponse<T> | null | undefined;
    try {
      command = (await read()).data;
    } catch (error) {
      signal.throwIfAborted();
      // A failed status read says nothing about the accepted command. Poll again on transport errors.
      const status = (error as {status?: number})?.status;
      if (!(error instanceof Error) || !("status" in error) ||
          (status && status < 500 && status !== 408 && status !== 429)) throw error;
      await wait();
      continue;
    }
    signal.throwIfAborted();
    if (!command) throw new Error("未找到这次开书操作，请重新打开开书页查看进度。");
    switch (command.status) {
      case "failed":
      case "cancelled":
      case "stale":
        throw new Error(command.errorMessage || "这次开书操作已停止，请在开书页查看详情。");
      case "succeeded":
        if (command.result?.batch) return command.result;
        throw new Error("开书操作已结束，未返回候选方案，请重新打开开书页查看结果。");
      case "queued":
      case "leased":
      case "running":
        await wait();
        break;
      default:
        throw new Error("无法识别开书进度，请重新打开开书页。");
    }
  }
}
