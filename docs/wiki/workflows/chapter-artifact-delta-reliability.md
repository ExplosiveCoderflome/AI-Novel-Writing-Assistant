# 章节资产 Delta 抽取可靠性

## Background

章节正文完成后，系统会从一次统一的结构化调用中提取摘要、硬事实、角色状态、资源和伏笔变化。该调用服务于后续章节上下文，不应成为正文生产的阻塞点。

## Current Rule

- 首轮抽取优先保留会影响下一章的核心变化，输入上下文按角色、状态、资源和伏笔窗口裁剪。
- 输出预算由 Prompt Budget Profile 统一控制；结构化校验关注 JSON 结构和关键枚举，不因普通字段长度略超就重复整章调用。
- 同一 `contentHash` 的抽取检查点失败后只允许有限重试；达到上限后按降级结果继续章节链路，后续再由补偿同步处理。
- `adaptive` 和 `deferred` 模式遇到同一正文版本的运行中检查点时记录降级边界并继续，不得重新执行正文验收或局部修复；`strict` 模式仍须等待资产完成边界。
- 资产抽取失败属于章节级资料债务，除非正文不可用或存在数据安全风险，不得阻断全书自动导演。

## Failure Modes

- 输出 token 达到上限且 JSON 不完整：优先缩短资产列表或进入补偿抽取，不重复发送同一大请求。
- Schema 字段轻微超长：保留结构化结果，使用确定性裁剪或归一化；只有关键字段缺失、类型错误或枚举非法才判定失败。
- 同一正文版本反复失败：检查模型输出预算和 schema 复杂度，禁止通过无限重试掩盖问题。
- 服务重启遗留 `running` 检查点：自适应链路按资料债务继续，后续补偿同步接管；不能将其归类为正文生成失败或消耗章节修复预算。

## Related Modules

- `server/src/services/novel/runtime/ChapterArtifactDeltaService.ts`
- `server/src/services/novel/runtime/artifactSync/ChapterArtifactCheckpointStore.ts`
- `server/src/prompting/prompts/novel/chapterArtifactDelta.prompts.ts`
