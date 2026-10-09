# Director V2 Resource Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Subagent work requires separate user approval and an explicit Luna model.

**Goal:** 让 V2 最终正文的资源变化可靠地进入下一章，同时减少重复分析和重复提交。

**Architecture:** 保留统一 Delta 抽取和版本检查点。共享状态服务仅接受显式、版本受保护的 V2 资源处理建议；章节摘要 RAG 复用同一抽取结果，不建立第二份事实来源。

**Tech Stack:** TypeScript、Zod、Prisma、Node test runner、隔离 SQLite。

**Spec:** `docs/superpowers/specs/2026-10-09-director-v2-resource-continuity-design.md`

## Global Constraints

- 不调用 V1 导演任务状态机；V1 保留原有行为。
- 无数据库结构变更，不对开发数据库执行写入或迁移。
- 静态目录与动态状态分离，不冻结资源状态提高缓存率。
- 普通资料疑问不阻断全书；质量优先人工暂停、重规划和完整性保护沿用原规则。
- 在 `D:\code\ai` 的专用分支执行。只提交本阶段文件，不推送或合并。

---

### Task 1: 相关前章未决资源进入 V2 上下文

**Files:** `characterResource/CharacterResourceLedgerService.ts`、`runtime/GenerationContextAssembler.ts`、`server/tests/novelProduction/resourceContinuity.test.js`。

**Interfaces:** `buildContext(novelId, {chapterId, chapterOrder, characterIds, includePreviousPending})` 消费结构化角色与章节范围，返回现有 `CharacterResourceContext`。

- [x] 写测试，固定前章/未来章/其他小说/失效正文及无关角色提案，断言 `pendingProposalItems.map(x => x.id)` 等于手工确定的相关集合。
- [x] `node --test server/tests/novelProduction/resourceContinuity.test.js` 观察缺少前章提案的失败。
- [x] 增加显式 V2 查询范围及角色/正文版本过滤；`GenerationContextAssembler` 仅在 `novel.directorVersion === "v2"` 启用。
- [x] 重跑测试，补 V1 原有当前章查询保持不变和八项预算用例。
- [x] V2 资源读取失败在正文生成前报告，V1 保留容错；先验证吞错失败再通过聚焦回归。

### Task 2: 单次结构化抽取给出资源处理建议

**Files:** `prompting/prompts/novel/chapterArtifactDelta.prompts.ts`、`runtime/ChapterArtifactDeltaService.ts`、`state/StateCommitService.ts`、相关测试。

**Interfaces:** 单条 Delta 的 `reviewDecision?: "commit" | "hold"`；共享提交入口接收批准/暂缓资源 key，并验证 V2 归属和 `expectedChapterContent`。

- [x] 测试 AI commit 对普通损耗生效；hold、高风险、低置信度、无证据、冲突、旧 hash 和 V1 归属拒绝权限。
- [x] 运行聚焦测试观察期望行为失败。
- [x] 扩展已注册 Prompt Schema 和提示，提升版本，保持结构化骨架/目录前缀布局。
- [x] 通过统一状态提交消费建议；不调用额外模型确认或绕过冲突检查。
- [x] 回归既有 `stateCommitService`、资源校验与 Prompt 缓存测试。

### Task 3: 版本化硬事实进入现有摘要索引

**Files:** `runtime/artifactSync/facts/`、`rag/facts/`、`rag/RagIndexService.ts`、`rag/HybridRetrievalService.ts`、相关测试。

**Interfaces:** V2 摘要文档加载器返回 `RagSourceDocument[] | null`（null 仅表示 V1 旧来源）；过滤器接收候选 `RetrievedChunk[]` 和当前章节，返回版本有效的候选。

- [x] 测试一次抽取的具体事实生成独立 preChunks；正文更新/未来章/不完整写入不进入召回；V1 旧来源保持。
- [x] 运行聚焦测试观察缺少事实分块的失败。
- [x] 提取摘要与事实写入到明确所有权目录；使用当前 hash 成功检查点与已写事实生成摘要/事实块。
- [x] 在融合前过滤旧版本事实块，保留异步索引的 job 失败记录。
- [x] 结构化摘要/事实分块不增加上下文模型调用；仅最终消费者安排 V2 正文与摘要索引，保留 V1 索引行为。
- [x] 回归保存后恢复、资源检查点、缓存布局与真实 SQLite 提交保护。

### Task 4: 验证、文档与阶段提交

- [x] 执行服务端构建或 TypeScript 检查；运行上述新增和相关既有测试，不启动真实模型生成。
- [x] 更新资源工作流、Delta 可靠性和模块边界说明。
- [x] 使用 readme-release-updater，更新同日发布说明与 README 最新日期摘要。
- [x] 检查暂存范围，仅提交本任务文件，使用 `优化：` 或 `修复：` 主题。

## 验证记录与边界

- `pnpm --filter server build` 通过。
- 相关生产链、状态提交、资源校验、上下文、缓存布局、对话影响、V1/V2 隔离与内核边界回归共 159 项；初轮 158 项通过，唯一失败是精确版本断言仍使用 v5。更新为本次 v6 后，该文件三项单独复跑通过。最终复核补充 V2 资源读取失败保护，再构建并复跑上下文及相关缓存/衔接测试；其余未受影响的通过结果复用，避免重复昂贵检查。
- 新增行为均先观察失败再实现：前章未决约束、统一批准、独立事实分块、草稿索引时机、事实背景零新增 AI 调用、空建议暂缓、文本归一化与同 ID 多来源版本过滤。
- SQLite 用例只使用新建临时库，不调用真实模型或开发库。没有前端修改，不做浏览器验收与桌面打包；没有数据库结构变更。
- 厂商缓存命中和真实生成质量须在后续新调用中按阶段对比；版本标记过滤不替代历史无标记索引重建和全书编辑撤销。
