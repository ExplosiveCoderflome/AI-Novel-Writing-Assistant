# TASK.md 对照清单与本轮实现范围

本文档对照 [TASK.md](../TASK.md) 标注每项计划的当前状态、证据与本轮是否纳入实现。

## 阶段一：创作决策记忆系统

| 计划项 | 当前状态 | 证据 | 本轮纳入 |
|--------|----------|------|----------|
| 1.1 CreativeDecision / WritingSession 数据模型 | 未实现 | schema.prisma 无对应 model | 是（阶段 5） |
| 1.2 创作决策采集（显式/隐式/管线） | 未实现 | 无 creativeDecision、创作笔记相关代码 | 是（阶段 5，先做最小模型+注入） |
| 1.3 上下文注入增强（buildContextText 注入决策） | 未实现 | NovelCoreService.buildContextText 无 decisions | 是（阶段 5） |
| 1.4 CreativeDecisionPanel 前端 | 未实现 | 无 CreativeDecisionPanel、创作笔记 | 后置（阶段 5 先做后端） |

## 阶段二：事件驱动钩子系统

| 计划项 | 当前状态 | 证据 | 本轮纳入 |
|--------|----------|------|----------|
| 2.1 EventBus 基础设施 | 未实现 | server/src/events 目录不存在 | 是（阶段 4） |
| 2.2 事件类型定义 | 未实现 | 无 chapter:drafted 等类型 | 是（阶段 4） |
| 2.3 syncChapterArtifacts 拆到事件 handler | 未实现 | NovelCoreService 仍内联摘要/fact/RAG | 是（阶段 4） |
| 2.4 钩子注册机制 | 未实现 | 无 eventBus.on 注册 | 是（阶段 4） |

## 阶段三：专家代理团队

| 计划项 | 当前状态 | 证据 | 本轮纳入 |
|--------|----------|------|----------|
| 3.1 BaseAgent / PlannerAgent / WriterAgent 等类 | 部分实现 | agents 有 orchestrator、runtime、toolRegistry，无独立 Agent 类 | 否（不重做现有 agents） |
| 3.2 代理定义（每 Agent 独立 model/temperature） | 部分实现 | types/approvalPolicy 有角色与工具权限 | 否 |
| 3.3 编排器与管线集成（executePipeline→AgentOrchestrator） | 部分实现 | 管线仍走 NovelCoreService/chapterWritingGraph | 否 |
| 3.4 激活 chapterWritingGraph | 部分实现 | chapterWritingGraph 已接入 createChapterStream/runPipelineChapter | 否 |
| 3.5 用户可配置代理参数（按角色选模型） | 部分实现 | RuntimeSidebar 有全局 provider/model，无按角色配置 | 否（阶段 3 做模型路由，可扩展） |

## 阶段四：智能模型路由

| 计划项 | 当前状态 | 证据 | 本轮纳入 |
|--------|----------|------|----------|
| 4.1 modelRouter.ts | 未实现 | server/src/llm 无 modelRouter.ts | 是（阶段 3） |
| 4.2 TaskType / resolveModel 路由策略 | 未实现 | factory 仅 provider+options | 是（阶段 3） |
| 4.3 ModelRouteConfig 表 | 未实现 | schema 无 ModelRouteConfig | 是（阶段 3） |
| 4.4 设置页「模型路由」标签 | 未实现 | SettingsPage 无该标签 | 是（阶段 3） |
| 4.5 getLLM(provider, options, taskType?) | 未实现 | getLLM 无 taskType | 是（阶段 3） |

## 阶段六：叙事距离感知检索

| 计划项 | 当前状态 | 证据 | 本轮纳入 |
|--------|----------|------|----------|
| 6.1 HybridRetrievalService 距离衰减 | 未实现 | 无 applyNarrativeDecay、currentChapterOrder | 是（阶段 2） |
| 6.2 RagIndexService chapterOrder/importance 元数据 | 部分实现 | 部分 owner 已写 order，需统一 | 是（阶段 2） |
| 6.3 关键内容锚点不衰减 | 未实现 | 无 importance 标记 | 后置（阶段 2 先做距离衰减） |

## 阶段七：AI 推理过程可视化

| 计划项 | 当前状态 | 证据 | 本轮纳入 |
|--------|----------|------|----------|
| 7.1 GenerationTrace 模型 | 部分实现 | 有 AgentRun/AgentStep，无章节级 GenerationTrace | 是（阶段 3：复用 AgentRun/Step 接章节） |
| 7.2 LangGraph 节点插桩 | 未实现 | chapterWritingGraph 无 traced 包装 | 是（阶段 3：接入现有 trace） |
| 7.3 NovelChapterEdit 生成轨迹面板 | 未实现 | 章节编辑页无轨迹入口 | 是（阶段 3） |

## 阶段八：创作快照与版本回溯

| 计划项 | 当前状态 | 证据 | 本轮纳入 |
|--------|----------|------|----------|
| 8.1 NovelSnapshot 模型 | 未实现 | schema 无 NovelSnapshot | 是（阶段 5） |
| 8.2 自动快照时机 | 未实现 | 无 pipeline/outline 前快照 | 是（阶段 5） |
| 8.3 restoreFromSnapshot | 未实现 | 无该方法 | 是（阶段 5） |
| 8.4 NovelEdit 版本历史标签 | 未实现 | 无快照列表/恢复 UI | 是（阶段 5） |

## 本轮范围收敛

- **立即修复**：智能代理「前两章写了什么」「写第三章」未命中正确工具（阶段 1）。
- **MVP 补齐**：叙事距离衰减（阶段 2）、模型路由 + 章节轨迹（阶段 3）、事件总线（阶段 4）、创作决策记忆 + 小说快照（阶段 5）。
- **后置**：CreativeDecisionPanel 前端、按角色配置代理、从某阶段重跑、importance 锚点。
