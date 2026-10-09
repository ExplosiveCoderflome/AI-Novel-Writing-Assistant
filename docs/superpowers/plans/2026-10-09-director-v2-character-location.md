# 导演 V2 角色位置连续性 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 不派遣子代理。

**Goal:** 最终正文位置回填后，下一章按角色继承真实位置，防止视角切换与非当下叙述造成角色瞬移。

**Architecture:** 统一抽取增加位置结构，独立角色位置模块验证并存储版本化检查点投影。上下文装配动态读取章前位置，写作、验收、修文共用硬事实；V1 独立。

**Tech Stack:** TypeScript、Zod、Prisma、Node test runner、临时 SQLite。

**Spec:** `docs/superpowers/specs/2026-10-09-director-v2-character-location-design.md`

## Global Constraints

- 不新增每角色模型调用；不批量重新抽取历史正文；不操作开发库。
- 位置投影在最终正文保存及修复之后、下一章之前；正文版本、小说身份、角色身份和证据必须验证。
- 局部位置质量问题保留提醒，不强制阻断全书；仅完整性失败遵循资产边界恢复。
- 动态位置不进入稳定缓存前缀；V1 不读写投影。
- 不修改本次开始前的用户未提交文件；功能分支执行；完成阶段提交，不自动推送或合并。

### Task 1: 结构化位置投影与按章读取

**Files:** 新建 `shared/types/characterLocation.ts`，`server/src/services/novel/characters/locations/{CharacterLocationService.ts,locationProjection.ts,index.ts,README.md}`，`server/tests/novelProduction/characterLocation.test.js`。

**Interfaces:** `CharacterLocationService.applyFinalChapter({novelId,chapterId,content,contentHash,deltas})`；`readBeforeChapter({novelId,chapterOrder,characters})` 返回带位置、来源与疑点的角色 Map。

- [x] 写失败用例：甲第十章在牢房，第十一章乙在客栈，读取第十二章甲仍在牢房。补非当下语境、疑点、证据失配、重复角色、正文变更、跨书、未来章和分页用例。
- [x] `node --test server/tests/novelProduction/characterLocation.test.js`，确认缺失功能失败。
- [x] 实现 Zod 输出与投影契约，证据/身份/版本验证及分页读取，投影幂等 upsert。
- [x] 同一测试通过；临时 SQLite 运行真实事务验证。

### Task 2: 接入统一回填与上下文

**Files:** 修改 `ChapterArtifactDeltaService.ts`、`artifactSync/ChapterArtifactRecoveryService.ts`、`GenerationContextAssembler.ts`、`characters/characterHardFacts.ts`、`shared/types/chapterRuntime.ts`，扩展相应测试。

**Interfaces:** V2 消费者列表包含 `character_locations`；结构化抽取结果携带可恢复的位置数组；运行上下文角色及硬事实携带 `locationState`。

- [x] 失败用例证明 V2 等待位置消费者且恢复不重复抽取，V1 不调用位置模块。验证上下文使用章前位置而非缓存档案位置。
- [x] 位置模块经 facade 接入，复用最终候选保存/恢复链，动态读取位置。
- [x] 运行位置、资产恢复、最终候选选择及上下文针对测试。

### Task 3: Prompt、缓存与交付

**Files:** 修改 `chapterArtifactDelta.prompts.ts`、`context/chapterContextBlocks.ts`、`chapterAcceptance.prompts.ts`、修文位置上下文；更新针对 Prompt 测试、wiki、README、release notes。

- [x] 失败用例确认结构化语境和位置来源进入动态区，改变位置不改变稳定前缀，缺失旧位置字段兼容。
- [x] 在现有注册 Prompt 延展契约和版本，验收引用位置证据并生成现有局部修复指令；证据不明确时不批准移动，不增加专项调用。
- [x] `pnpm --filter @ai-novel/shared build`、`pnpm --filter @ai-novel/server build` 与受影响测试；UI 验收留用户。
- [x] 自查版本、防未来/跨书、无额外调用和非阻断策略，更新持久 wiki 及用户更新说明。
- [x] 仅暂存本阶段文件，提交 `优化：导演V2跨章继承角色位置并核对移动证据`，保留功能分支。

## 执行结果

共享层和服务端构建通过；82 项针对测试通过（临时 SQLite 子进程另覆盖10组位置与真实统一消费者场景）。覆盖身份/版本、分页继承、质量债务、恢复、最终候选边界、V1 隔离及动态缓存布局。未操作开发库，未做 UI 或真实模型付费生成验收；真实空间语义遵循度和缓存命中率留待后续日志验证。保留功能分支，不自动推送或合并。
