export function shouldToastApiError(config: {errorPresentation?: "toast" | "inline"; silentErrorStatuses?: number[]}, status?: number): boolean {
  return config.errorPresentation !== "inline" && (status === undefined || !config.silentErrorStatuses?.includes(status));
}
