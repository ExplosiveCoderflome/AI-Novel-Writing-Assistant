# 模型路由连通性检查统一状态管理计划

> 状态：已实施（Implemented）
> 实施提交：`4adb50c5`（分支 `ops/deploy-fixes`，基于 v0.4.13 308ca1b3）
> 日期：2026-08-16
> 作者：运维总监（ops_agent）
> 关联模块：前端设置页 / 后端 LLM 连通性检查服务
> 验证状态：前端 tsc + vite build 通过；后端 tsc 零新增错误（上游 4 处 pre-existing 错误除外）；
> Docker 部署与运行验证待执行（依赖部署文件恢复，见 Open Work）

---

## 1. 问题描述

### 1.1 现象

进入系统设置相关页面时，会**反复触发完整的模型路由连通性检查**，每次检查都会向所有已配置的模型服务商（如本地 LM Studio 私有化部署）发送普通对话 + 结构化输出两类探针请求：

- 进入 `/settings`（设置首页）→ 触发一次全量检查
- 进入 `/settings/models`（模型与厂商）→ 触发一次全量检查
- 刷新页面后再次进入 → 再次触发

在私有化部署的小型模型场景下，模型被探针请求持续占用，**导致正常创作任务无法使用模型**。

### 1.2 根因分析

| 层 | 根因 | 证据 |
|----|------|------|
| 前端 | 两个设置页面各自用 `useQuery` 自动触发检查，`staleTime` 未设置（React Query 默认 0），组件挂载时数据恒为过期 → 每次进入页面自动重新请求 | `SettingsOverviewPage.tsx`、`ModelRoutesPage.tsx` 中 `connectivityQuery` 均无 `staleTime`，`refetchOnMount` 默认开启 |
| 前端 | 两个页面互不感知，各自持有独立的检查逻辑，无统一入口 | 两个页面分别 `import { testModelRouteConnectivity }` 并各自 `useQuery` |
| 后端 | `testModelRoutes()` 每次调用都全量解析路由并发送探针，**无任务去重、无结果缓存、无配置变化感知** | `server/src/llm/connectivity.ts:332`，每次调用 `resolveModel` + `testConnection({ probeMode: "both" })` |

### 1.3 影响

- 私有化部署的小模型（响应 25–37s）被高频探针请求持续骚扰，创作任务排队/超时
- 探针请求与真实创作请求争抢模型资源
- 多个设置页面进入即触发，浪费算力与 API 配额

---

## 2. 目标与设计原则

### 2.1 目标

1. **任务唯一**：无论从哪里触发检查，只要已有检查任务在运行，后续触发只返回当前任务状态，不重复走探针流程（single-flight）
2. **配置感知**：只要模型路由配置没有变化，就返回上次检查的结果，不发探针
3. **手动可控**：允许用户主动触发检查并刷新检查状态

### 2.2 设计原则

- **状态收口**：检查任务状态由后端统一持有（全局单例），前端只消费状态
- **前端统一**：所有页面通过同一个 Hook 与后端交互，消除重复逻辑
- **异步非阻塞**：检查任务异步执行，触发请求立即返回任务状态，前端轮询完成
- **改动最小**：探针执行体（`runModelRoutesProbe`）逻辑不变，仅做编排层改造

---

## 3. 架构设计

### 3.1 统一任务状态机

```
┌──────────┐   POST /check (指纹变化 或 force)   ┌───────────┐
│   idle   │ ──────────────────────────────────▶ │  running  │
└──────────┘                                     └─────┬─────┘
     ▲                                                │ 完成
     │                                                ▼
     │          ┌────────┐                     ┌──────────────┐
     └──────────│  done  │◀────────────────────│ 探针执行体     │
                └────────┘                     │(single-flight)│
                 (结果+指纹+时间)               └──────────────┘
```

状态说明：

| 状态 | 含义 |
|------|------|
| `idle` | 无检查任务（进程启动后初始态） |
| `running` | 有检查任务正在执行（全局仅允许一个） |
| `done` | 检查完成，持有结果 + 配置指纹 + 时间戳 |

### 3.2 触发决策流程

```
POST /api/llm/model-routes/connectivity  { force?: boolean }

1. status === "running"
   → 返回 { status: "running", taskId, startedAt }        // single-flight，不新起任务

2. 解析当前生效路由 → 计算配置指纹 fingerprint_now
   指纹 = 全量路由 [taskType, provider, model, requestProtocol, structuredResponseFormat] 序列化

3. !force && status === "done" && fingerprint === fingerprint_now
   → 返回 { status: "done", result: 缓存结果, cached: true }   // 配置未变 → 零探针

4. 否则 → 启动新任务（异步执行，请求立即返回 running）
   state.status = "running"
   state.inFlight = runModelRoutesProbe(routes)
     .then(完成 → status="done", 存 result + fingerprint)
```

---

## 4. 详细设计

### 4.1 后端

#### 4.1.1 新建 `server/src/llm/checkController.ts`

全局单例状态：

```ts
interface ModelRoutesCheckState {
  status: "idle" | "running" | "done";
  taskId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  fingerprint: string | null;       // 本次检查对应的配置指纹
  result: ModelRoutesResult | null;
  inFlight: Promise<ModelRoutesResult> | null;
}
```

导出函数：

| 函数 | 职责 |
|------|------|
| `triggerModelRoutesCheck({ force? })` | 统一触发入口，执行 3.2 决策流程 |
| `getModelRoutesCheckStatus()` | 返回当前任务状态（供前端轮询） |
| `resetModelRoutesCheckState()` | 重置状态（测试/维护用） |

要点：

- **single-flight 原子性**：第一个请求同步将 `status` 置为 `running` 后再进入异步探针，后续请求进入时已能看到 `running`（JS 单线程天然保证）
- **并发去重**：`inFlight` 保存进行中的 Promise，同一时刻仅一个探针执行体
- **指纹缓存**：`done` 状态持有指纹，配置未变且非 force 时直接返回缓存
- **失败处理**：检查全部失败时结果保留在 `statuses`（每条带 `error`），UI 显示异常；**全失败时不更新指纹缓存**，下次触发重查

#### 4.1.2 改造 `server/src/llm/connectivity.ts`

将现有 `testModelRoutes` 主体抽取为 `runModelRoutesProbe(routes)` 并导出，包含：

- 同路由去重（现有 `dedupedChecks`）
- `probeMode: "both"` 探针
- `shouldPersistProbeResult` → `upsertModelRouteConfig` 逻辑（探针发现有效协议/格式差异时持久化）

`testModelRoutes` 原导出保留为薄封装（调用 `triggerModelRoutesCheck`），保持兼容。

#### 4.1.3 改造 `server/src/routes/llm.ts`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/llm/model-routes/connectivity` | POST | 改造：body `{ force?: boolean }`，返回任务状态（`running`/`done`） |
| `/api/llm/model-routes/connectivity/status` | GET | 新增：返回当前任务状态，供前端轮询 |

响应结构统一：

```ts
interface ModelRoutesCheckResponse {
  status: "idle" | "running" | "done";
  taskId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  result: ModelRoutesResult | null;   // 仅 done 时非空
  cached?: boolean;                    // done 且来自缓存时标记
}
```

### 4.2 前端

#### 4.2.1 改造 `client/src/api/settings.ts`

```ts
export async function testModelRouteConnectivity(force = false) {
  const { data } = await apiClient.post<ApiResponse<ModelRouteConnectivityCheckResponse>>(
    "/llm/model-routes/connectivity", { force },
  );
  return data;
}

export async function getModelRouteConnectivityStatus() {
  const { data } = await apiClient.get<ApiResponse<ModelRouteConnectivityCheckResponse>>(
    "/llm/model-routes/connectivity/status",
  );
  return data;
}
```

#### 4.2.2 新建 `client/src/hooks/useModelRouteCheck.ts`

统一 Hook，所有页面共用：

```ts
export function useModelRouteCheck() {
  const queryClient = useQueryClient();
  const checkKey = queryKeys.settings.modelRouteConnectivity;

  // 状态查询：running 时自动轮询 2s，done/idle 停止
  const statusQuery = useQuery({
    queryKey: checkKey,
    queryFn: getModelRouteConnectivityStatus,
    refetchInterval: (q) => q.state.data?.data?.status === "running" ? 2000 : false,
    refetchOnWindowFocus: false,
  });

  // 触发检查（后端保证 single-flight + 指纹缓存）
  const triggerCheck = useMutation({
    mutationFn: (force = false) => testModelRouteConnectivity(force),
    onSuccess: (resp) => {
      queryClient.setQueryData(checkKey, resp);          // 统一状态写入，跨页面共享
      if (resp.data.status === "running") statusQuery.refetch();  // 开始轮询
    },
  });

  return {
    status: statusQuery.data?.data,
    isChecking: statusQuery.data?.data?.status === "running",
    triggerCheck,                       // 手动刷新：triggerCheck(true)
    checkAfterConfigChange: () => {     // 保存路由后：invalidate + 触发
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings.modelRoutes });
      triggerCheck.mutate(false);
    },
  };
}
```

#### 4.2.3 改造 `client/src/pages/settings/ModelRoutesPage.tsx`

- 删除自有 `modelRouteConnectivityQuery`，改用 `useModelRouteCheck()`
- 手动"重新检测"按钮 → `triggerCheck(true)`（force 刷新）
- 三个保存 mutation（保存路由 / 套用模型 / 保存备用模型）onSuccess → `checkAfterConfigChange()`
- UI 状态判断改用 `isChecking` / `status.result`

#### 4.2.4 改造 `client/src/pages/settings/views/SettingsOverviewPage.tsx`

- 删除自有 `connectivityQuery`，改用 `useModelRouteCheck()`
- ReadinessCard 传入统一状态：
  - `running` → checking（"检查中"）
  - `done` → 按结果（ready / warning）
  - `idle` → 未检测

#### 4.2.5 （可选）改造 `SettingsReadinessCard.tsx`

- `SettingsReadinessItem` state 增加 `"idle"`（未检测）
- 现状：从未检测过时 `failedRouteCount === 0` 导致"模型路由"误显示"可用"
- 增加 idle 分支，badge 显示"未检测"，主按钮仍导向 `/settings/models`

---

## 5. 需求映射

| 用户要求 | 实现 |
|---------|------|
| 1. 已开启检查则后续触发只返回任务状态 | 后端 `running` 分支 + `inFlight` single-flight，不重复走流程 |
| 2. 配置未变返回上次结果 | 后端指纹缓存（`!force && fingerprint 相同 → 返回缓存`） |
| 3. 允许手动刷新检查状态 | 前端 `triggerCheck(true)` → `force` 绕过后端指纹缓存（仍受 single-flight 约束） |

---

## 6. 改动清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `server/src/llm/checkController.ts` | 新增 | 统一状态机、single-flight、指纹缓存 |
| `server/src/llm/connectivity.ts` | 修改 | 抽取导出 `runModelRoutesProbe`，`testModelRoutes` 改为薄封装 |
| `server/src/routes/llm.ts` | 修改 | POST 改造 + 新增 GET status |
| `client/src/api/settings.ts` | 修改 | `testModelRouteConnectivity(force)` + 新增 `getModelRouteConnectivityStatus` |
| `client/src/hooks/useModelRouteCheck.ts` | 新增 | 统一 Hook |
| `client/src/pages/settings/ModelRoutesPage.tsx` | 修改 | 接入 Hook，保存后自动检查 |
| `client/src/pages/settings/views/SettingsOverviewPage.tsx` | 修改 | 接入 Hook |
| `client/src/pages/settings/components/SettingsReadinessCard.tsx` | 修改（可选） | 增加"未检测"状态 |

---

## 7. 实施步骤

1. **后端状态机**：新建 `checkController.ts`，实现状态管理 + 指纹缓存 + single-flight
2. **后端探针抽取**：`connectivity.ts` 抽取 `runModelRoutesProbe`
3. **后端路由**：`routes/llm.ts` 改造 POST + 新增 GET status
4. **后端自测**：单元测试覆盖状态机分支（running 去重 / 指纹缓存 / force）
5. **前端 API**：`settings.ts` 新增/改造 API 函数
6. **前端 Hook**：新建 `useModelRouteCheck.ts`
7. **页面接入**：`ModelRoutesPage.tsx`、`SettingsOverviewPage.tsx`
8. **ReadinessCard 优化**（可选）：idle 状态
9. **构建与部署**：前端 build + Docker 容器组重启
10. **验证**：见第 8 节

---

## 8. 验证方案

| 场景 | 预期 |
|------|------|
| 进入 `/settings` 首页 | LM Studio 日志**无探针消息**，页面显示上次结果或"未检测" |
| 进入 `/settings/models` | LM Studio 日志**无探针消息** |
| 刷新页面后再进入 | 无探针消息（需手动触发才检查） |
| 点"重新检测"按钮 | 恰好**一次**探针请求 |
| 检查进行中再次点"重新检测" | 返回 `running`，**不发起新探针** |
| 保存任意路由配置 | 自动触发**一次**新检查（指纹变化） |
| 配置未变、检查完成后再次触发 | 返回缓存结果（`cached: true`），零探针 |
| 多个浏览器标签页同时触发 | 后端仅一个探针任务，其余返回 `running` |
| 手动 force 刷新 | 绕过缓存，重新探针（进行中仍受 single-flight 约束） |

---

## 9. 边界情况与风险

| 场景 | 处理 | 风险等级 |
|------|------|---------|
| 并发触发（多请求同时进入） | 首个请求同步置 running，后续返回进行中 | 低 |
| 检查全部失败 | 结果保留 error 信息，不更新指纹缓存，下次重查 | 低 |
| force 手动刷新期间有任务在跑 | 返回 running，不并发探针 | 低 |
| 进程重启 | 状态归零 → idle，首次触发正常启动 | 低 |
| 外部模型变更（LM Studio 换模型） | 手动 force 刷新获取新鲜结果 | 低 |
| 缓存结果与真实状态偏差（TTL 缺失） | 指纹缓存无 TTL，靠 force 手动刷新；如需自动过期可后续加 TTL（如 5min） | 中（接受） |

---

## 10. 回滚方案

- 后端：`checkController.ts` 删除、`connectivity.ts` / `routes/llm.ts` 恢复为当前版本（git checkout）
- 前端：`useModelRouteCheck.ts` 删除，两个页面恢复原 `useQuery` 逻辑
- 整体：`git stash` / 保留改动前的分支标签
