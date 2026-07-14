# 视频改编与 OpenMontage 桥接流程

## Background

为了让小说作者能够将写好的章节便捷地改编为短视频或宣传预告片，本项目集成了 OpenMontage 视频渲染工具。为了保持系统解耦和便于未来深入融合，我们将桥接适配层（Bridge）的代码直接合并到了 GeneralAgent 代码库中，并将其作为一个独立的外部微服务调用。

## Decision

1. **桥接服务独立化**：在 `tools/openmontage-bridge` 下维护桥接服务代码，使用 FastAPI 框架。
2. **轻量耦合**：主后端服务与桥接服务通过 HTTP API 进行通信。
3. **环境参数化**：桥接服务不硬编码 OpenMontage 的安装路径，而是通过 `OPENMONTAGE_ROOT` 环境变量动态指定。
4. **统一 Prompt 治理**：视频脚本与预告片脚本的 AI 生成逻辑均注册于 `PromptRegistry` 中，禁止在 Service 中直接拼接 Inline System Prompt。

## Current Rule

- **服务部署**：桥接服务独立运行于本地或容器中（默认端口 8001），使用 `tools/openmontage-bridge/requirements.txt` 安装依赖，启动入口为 `server.py`。
- **数据库模型**：
  - `VideoProject` 模型记录了视频改编项目的生命周期。
  - 字段包括 `id`, `novelId`, `chapterId`, `title`, `type` (ADAPTATION / TRAILER), `status` (DRAFT / RENDERING / COMPLETED / FAILED), `scriptData` (JSON 格式场景脚本), `videoUrl`, `error`, `createdAt`, `updatedAt`。
- **AI 脚本生成**：
  - 改编脚本 Prompt 注册为 `video.novel_to_script@v1`，将章节文本转换为结构化的分镜场景（包含画面描述、旁白、配乐类型、转场）。
  - 预告片 Prompt 注册为 `video.novel_trailer@v1`，根据小说大纲与关键看点生成高冲突、高张力的预告分镜。
  - 脚本生成均通过结构化 LLM 输出（Zod schema 校验），确保返回的标准 JSON 数据可被桥接服务直接消费。
- **渲染任务流**：
  - 渲染任务提交到桥接服务后，由桥接服务负责异步启动 OpenMontage 渲染管线。
  - 主服务定时或通过轮询 `GET /api/adapter/task-status` 接口，更新 `VideoProject` 的渲染状态与最终视频 URL。

## Failure Modes

- **硬编码路径**：在适配器代码中硬编码 `C:\Users\lilin\OpenMontage` 等绝对路径。必须使用环境变量 `OPENMONTAGE_ROOT` 访问 OpenMontage 的资源与代码。
- **缺少 Prompt 注册**：在 `VideoScriptService.ts` 中直接硬编码 prompt 文本。必须统一将 prompt 注册在 `server/src/prompting/prompts/video/` 下。
- **并发渲染资源冲突**：未限制桥接服务的并发渲染任务，可能导致本地 GPU 显存溢出。需要在桥接端控制并发队列或在外部调度。

## Related Modules

- [tools/openmontage-bridge/server.py](file:///tools/openmontage-bridge/server.py) — 桥接服务 API 入口
- [tools/openmontage-bridge/adapters.py](file:///tools/openmontage-bridge/adapters.py) — 桥接适配与渲染逻辑
- [server/src/services/video/OpenMontageBridgeClient.ts](file:///server/src/services/video/OpenMontageBridgeClient.ts) — 主服务桥接客户端
- [server/src/services/video/VideoScriptService.ts](file:///server/src/services/video/VideoScriptService.ts) — AI 视频脚本生成服务
- [server/src/modules/video/http/videoRoutes.ts](file:///server/src/modules/video/http/videoRoutes.ts) — 视频改编 API 路由
- [client/src/pages/video/VideoWorkspacePage.tsx](file:///client/src/pages/video/VideoWorkspacePage.tsx) — 视频改编工作台前端
