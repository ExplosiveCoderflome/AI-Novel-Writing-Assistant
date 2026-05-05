/** 执行日志级别 */
export type DirectorExecutionLogLevel = "info" | "warn" | "error" | "success";

/** 单条执行日志条目 */
export interface DirectorExecutionLogEntry {
  id: string;
  taskId: string;
  novelId: string | null;
  stage: string;
  level: DirectorExecutionLogLevel;
  message: string;
  detail: unknown;
  durationMs: number | null;
  createdAt: string;
}

/** 执行日志列表响应 */
export interface DirectorExecutionLogListResponse {
  logs: DirectorExecutionLogEntry[];
  total: number;
}
