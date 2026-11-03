/** Translated by composition adapters only for a known unavailable projection dependency. */
export class DirectorProjectionUnavailableError extends Error {
  readonly statusCode = 503;
  readonly code = "director_projection_unavailable";
  constructor(readonly reasonCode = "production_storage_not_ready") {
    super("正文运行存储尚未就绪，请检查数据库结构后重试。");
    this.name = "DirectorProjectionUnavailableError";
  }
}

const PUBLIC_FAILURES: Readonly<Record<string, {code: string; message: string}>> = {
  "模型缺少明确的上下文窗口配置。": {code: "kernel_model_window_missing", message: "模型缺少明确的上下文窗口配置，请补齐后继续。"},
};
const WINDOW_MISSING_PREFIX = "模型缺少明确的上下文窗口配置";

/** The window-missing message may append the exact provider/model, so match only that stable prefix. */
function knownPublicFailure(message: string) {
  if (Object.hasOwn(PUBLIC_FAILURES, message)) return PUBLIC_FAILURES[message];
  if (message.startsWith(WINDOW_MISSING_PREFIX)) return PUBLIC_FAILURES["模型缺少明确的上下文窗口配置。"];
  return null;
}

/** Old persisted errors lack a code. Only explicitly known messages may cross the API boundary. */
export function publicRuntimeFailure(payload: unknown): {code: string; message: string; stepId: string | null} {
  const value = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const known = typeof value.message === "string" ? knownPublicFailure(value.message) : null;
  return {...known ?? {code: "director_execution_failed", message: "创作执行中断，请检查服务端运行日志。"},
    stepId: typeof value.stepId === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(value.stepId) ? value.stepId : null};
}
