export function isHistoricalAutoDirectorRecoveryNotNeededFailure(input: {
  lane?: string | null;
  status?: string | null;
  checkpointType?: string | null;
  lastError?: string | null;
}): boolean {
  if (input.lane !== "auto_director" || input.status !== "failed" || !input.checkpointType) {
    return false;
  }
  const message = input.lastError?.trim() ?? "";
  return message.includes("当前导演产物已经完整") && message.includes("无需继续自动导演");
}

export function isHistoricalAutoDirectorFront10RecoveryUnsupportedFailure(input: {
  lane?: string | null;
  status?: string | null;
  lastError?: string | null;
}): boolean {
  if (input.lane !== "auto_director" || input.status !== "failed") {
    return false;
  }
  const message = input.lastError?.trim() ?? "";
  return message.includes("服务重启后恢复失败")
    && message.includes("当前检查点不支持继续自动导演");
}

export function isAutoDirectorRecoveryInProgress(input: {
  status?: string | null;
  lastError?: string | null;
}): boolean {
  if (input.status !== "queued" && input.status !== "running") {
    return false;
  }
  const message = input.lastError?.trim() ?? "";
  return message.includes("服务重启")
    && message.includes("正在尝试恢复");
}
