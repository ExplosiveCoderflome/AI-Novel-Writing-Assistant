import type { ModelRouteTaskType } from "@ai-novel/shared/types/novel";
import { MODEL_ROUTE_TASK_TYPES, resolveModel } from "./modelRouter";
import { runModelRoutesProbe, type ModelRouteProbeInput, type ModelRoutesResult } from "./connectivity";

/**
 * 模型路由连通性检查统一状态机（single-flight + 指纹缓存）。
 *
 * - 全局单例：进程内只有一个检查任务状态，任何页面/请求触发都作用于同一任务
 * - single-flight：已有任务在跑时，后续触发只返回 running 状态，不重复走探针
 * - 指纹缓存：配置（路由指纹）未变时返回上次结果，零探针；force 可绕过
 * - 全失败不更新指纹缓存：下次触发会重新探测
 */
export type ModelRoutesCheckStatus = "idle" | "running" | "done";

export interface ModelRoutesCheckState {
  status: ModelRoutesCheckStatus;
  taskId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  /** 本次检查对应的配置指纹；仅成功（非全失败）时更新 */
  fingerprint: string | null;
  result: ModelRoutesResult | null;
}

export interface ModelRoutesCheckResponse extends ModelRoutesCheckState {
  /** done 且来自指纹缓存时标记 */
  cached?: boolean;
}

let state: ModelRoutesCheckState = {
  status: "idle",
  taskId: null,
  startedAt: null,
  completedAt: null,
  fingerprint: null,
  result: null,
};

let inFlight: Promise<void> | null = null;
let taskCounter = 0;

function computeFingerprint(routes: readonly ModelRouteProbeInput[]): string {
  return JSON.stringify(routes.map((route) => [
    route.taskType,
    route.provider,
    route.model,
    route.requestProtocol,
    route.structuredResponseFormat,
  ]));
}

function toResponse(cached = false): ModelRoutesCheckResponse {
  return { ...state, cached };
}

export async function triggerModelRoutesCheck(options: {
  force?: boolean;
  taskTypes?: readonly ModelRouteTaskType[];
} = {}): Promise<ModelRoutesCheckResponse> {
  const { force = false, taskTypes = MODEL_ROUTE_TASK_TYPES } = options;

  // 1. single-flight：已有任务在跑 → 直接返回进行中状态，不新起任务
  if (state.status === "running" && inFlight) {
    return toResponse();
  }

  // 2. 解析当前生效路由（与探针执行体共享同一份解析结果）并计算配置指纹
  const resolvedRoutes = await Promise.all(taskTypes.map(async (taskType) => ({
    taskType,
    ...(await resolveModel(taskType)),
  })));
  const fingerprint = computeFingerprint(resolvedRoutes);

  // 3. 指纹缓存：配置未变且非 force → 返回缓存结果，零探针
  if (!force && state.status === "done" && state.fingerprint === fingerprint && state.result) {
    return toResponse(true);
  }

  // 4. 启动新任务：同步置 running，异步执行探针，请求立即返回
  const taskId = `model-routes-check-${Date.now()}-${++taskCounter}`;
  state = {
    status: "running",
    taskId,
    startedAt: new Date().toISOString(),
    completedAt: null,
    fingerprint: null,
    result: null,
  };

  inFlight = (async () => {
    try {
      const result = await runModelRoutesProbe(resolvedRoutes);
      const allFailed = result.statuses.length > 0 && result.statuses.every((item) => !item.ok);
      state.status = "done";
      state.completedAt = new Date().toISOString();
      state.result = result;
      // 完全失败时不更新指纹缓存：下次触发重新探测
      if (!allFailed) {
        state.fingerprint = fingerprint;
      }
    } catch (error) {
      // 探针执行体异常：状态回退 idle，允许下次重试
      state.status = "idle";
      state.taskId = null;
      state.startedAt = null;
      state.completedAt = null;
      state.fingerprint = null;
      state.result = null;
      throw error;
    } finally {
      inFlight = null;
    }
  })();

  return toResponse();
}

export function getModelRoutesCheckStatus(): ModelRoutesCheckResponse {
  return toResponse();
}

export function resetModelRoutesCheckState(): void {
  state = {
    status: "idle",
    taskId: null,
    startedAt: null,
    completedAt: null,
    fingerprint: null,
    result: null,
  };
  inFlight = null;
}
