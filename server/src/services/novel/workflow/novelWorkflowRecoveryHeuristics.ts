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
