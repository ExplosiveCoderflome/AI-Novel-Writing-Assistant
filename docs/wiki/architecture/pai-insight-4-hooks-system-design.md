# PAI 启示四：事件钩子系统与主动式导演详细设计规范 (Pipeline Hooks System & Proactive Director)

本文档针对 Daniel Miessler PAI 框架的**启示四（事件钩子系统与主动式导演：Hooks System）**，结合 **Daydream Engine（白日做梦引擎 / GeneralAgent）** 的自动化执行管道（`chapterRuntimePipeline.ts` / `DirectorCommandService.ts` / `VideoRenderService.ts`），制定全生命周期事件钩子注册、主动式服务触发与错误归因机制。

---

## 一、 核心痛点与工程目标

### 1.1 痛点：被动响应与状态断层
在现有的自动化编排中，存在以下三个工程痛点：
1. **单向被动触发**：AI 仅在接收到显式请求时单次响应，缺乏“生成完成后主动审计”、“进入项目时主动提醒遗留债务”的主动服务能力。
2. **多模态渲染状态滞后**：视频渲染（FFmpeg）或音频生成完成后，数据库卡片上的 `errorMessage` 遗留旧错，未主动刷新为就绪状态。
3. **异常中断缺乏自动归因**：管道失败或触发 `defer_and_continue` 质量债务时，未能主动捕获 `QualityDebtAttribution` 并给出修复策略。

### 1.2 目标：生命周期 Hooks、主动式服务与异常自动修复
> **原则：在会话开启、工具/生成前后、渲染结束与管道异常时植入强类型 Hooks，将 AI 助理从“被动响应”升级为“主动编排与自愈”的智能体。**

---

## 二、 事件钩子注册架构 (Pipeline Hook Registry)

```
                            Daydream Engine 事件钩子总线架构
                            
  +-----------------------------------------------------------------------------------------+
  |  触发源 (Event Emitters)                                                                 |
  |  - 会话开启 (Session Start)                                                             |
  |  - 章节初稿写入 (Post Chapter Draft)                                                      |
  |  - 视频/音频渲染完成 (Post Video Render)                                                  |
  |  - 管道错误拦截 (Pipeline Error)                                                        |
  +-----------------------------------------------------------------------------------------+
                                               │ 事件通知 (Emit Event)
                                               ▼
  +-----------------------------------------------------------------------------------------+
  |  PipelineHookRegistry (统一事件钩子总线)                                                 |
  +-----------------------------------------------------------------------------------------+
                                               │ 调度执行 (Proactive Handlers)
      ┌─────────────────────────┬──────────────┴──────────────┬─────────────────────────┐
      ▼                         ▼                             ▼                         ▼
+-------------------+ +--------------------+ +--------------------+ +--------------------+
| 1. Session Start  | | 2. Post Draft      | | 3. Post Render     | | 4. Pipeline Error  |
| 自动加载历史质量  | | 自动轻量 Audit 与  | | 路径标准化 + 清空  | | 归因 QualityDebt  |
| 债务与未解决批注  | | 连贯性预检         | | 错误 + WebSocket   | | 与降级策略建议     |
+-------------------+ +--------------------+ +--------------------+ +--------------------+
```

### 2.1 强类型接口定义 (TypeScript Standard)

```typescript
// server/src/services/novel/director/automation/PipelineHookRegistry.ts

export type PipelineHookName =
  | "onSessionStart"
  | "onPostChapterDraft"
  | "onPostChapterRepair"
  | "onPostVideoRender"
  | "onPipelineError";

export interface PipelineHookPayload {
  novelId: string;
  chapterId?: string;
  taskId?: string;
  projectId?: string; // 视频项目 ID
  error?: unknown;
  metadata?: Record<string, unknown>;
}

export type PipelineHookHandler = (payload: PipelineHookPayload) => Promise<void>;
```

---

## 三、 四大关键主动钩子与确定性处理动作

### 3.1 `onSessionStart` (项目/会话启动钩子)
* **触发时机**：创作者在 UI 上打开某个小说项目。
* **主动动作**：
  1. 检索该小说最近的 `QualityDebtAttribution` 记录，汇总未解决的轻量质量债务。
  2. 自动载入 Hot Memory 活跃批注，并在前端 Cockpit 中输出“主动式建议提示”。

### 3.2 `onPostChapterDraft` (章节初稿完成钩子)
* **触发时机**：章节初稿写入 SQLite 数据库后。
* **主动动作**：
  1. 自动触发 `AuditService.assessChapterAuditNeed` 进行轻量连贯性与字数预检。
  2. 若字数达标且无硬性违规，自动标记状态为 `reviewed` 并同步生成 `ChapterSummary` 存入数据库。

### 3.3 `onPostVideoRender` (视频渲染完成钩子)
* **触发时机**：VellumReel / FFmpeg 渲染进程成功退出（0 错误码）。
* **主动动作**：
  1. 自动将视频绝对路径标准化为局域网/前端可用的 `/assets` 相对路径。
  2. 自动清空 `VideoProject` 表中的历史报错字段（`errorMessage: null`）。

### 3.4 `onPipelineError` (管道异常与质量债务钩子)
* **触发时机**：工作流任务捕获到未处理异常或 `defer_and_continue`。
* **主动动作**：
  1. 捕获 `QualityDebtAttribution`（如 `firstFailureClassificationCode`）。
  2. 生成降级 `ReplanRecommendation` 策略，供导演调度器在下一个重试周期参考。

---

## 四、 全量 100% 零回归兼容矩阵 (Zero-Regression Safeguards)

| 维度 | 安全保护设计 | 验证机制 |
| :--- | :--- | :--- |
| **异步隔离防卡死** | 所有 Hook Handler 采用 `Promise.allSettled` 或后台 Task 异步触发，绝对不阻塞主 HTTP 响应 | 响应延迟 benchmark |
| **异常吞噬保护** | 单个 Hook 执行失败（如 WebSocket 推送断开）在内部 log 后静默捕获，绝不上抛破坏主流程 | 单元测试 Error 隔离 |
| **数据库兼容** | 0 修改数据库 Schema，只基于已有的 Prisma Model 读写 | SQLite 读写回归测试 |

---

* **文档位置**：[docs/wiki/architecture/pai-insight-4-hooks-system-design.md](file:///Users/nvidia/GeneralAgent/docs/wiki/architecture/pai-insight-4-hooks-system-design.md)
* **状态**：启示四事件钩子与主动式导演规范已归档 Wiki
