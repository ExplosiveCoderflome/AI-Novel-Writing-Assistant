# 章节身份与规划扩展边界

## Background

节奏拆章和章节执行长期分别维护章节列表。节奏拆章使用卷工作区里的 `VolumeChapterPlan`，章节执行使用正式 `Chapter`。这种模型能保护规划态和执行态，但如果两边靠章序、标题和手动同步衔接，用户会看到“拆章已生成但执行区未更新”的内部步骤，也会增加自动导演恢复判断的复杂度。

完整小说生产链需要把“章节是什么”收敛到同一个身份，同时保留“章节如何规划”和“章节如何执行”的职责差异。

## Decision

`Chapter` 是唯一章节身份和执行主实体。`VolumeChapterPlan` 是卷级节奏规划扩展，必须尽量通过 `chapterId` 指向对应 `Chapter`。

短期内保留 `VolumeChapterPlan` 上的标题、摘要、任务单等兼容字段，但后端读写规则以 `Chapter` 为 canonical：

- 正式章节字段以 `Chapter` 为准：章序、标题、正文、执行状态、目标字数、冲突等级、揭露等级、禁止事项、任务单、场景卡和质量状态。
- 规划扩展字段以 `VolumeChapterPlan` 为准：卷归属、节奏段、章节目的、独占事件、章末状态、下章入口状态和伏笔引用。
- 缺少 `chapterId` 的旧规划只能作为兼容状态存在，服务层应优先按章序和标题补链，并把补链结果写回卷工作区。

## Current Rule

卷工作区读取时会用 `chapterId` 对齐正式章节，并用正式章节字段 hydrate 规划视图。没有 `chapterId` 的旧数据会按章序兜底匹配正式章节。

卷拆章保存、章节列表生成和自动导演拆章细化应自动维护正式章节记录，并写回 `VolumeChapterPlan.chapterId`。用户主流程不应要求理解或点击“同步到章节执行”。

`/volumes/sync-chapters` 保留为兼容修复和诊断入口。它的首要职责是修复章节连接和补齐执行入口，不应成为新手主流程的必要步骤。

## Failure Modes

- 如果规划章节有 `chapterId`，不得因为标题相同而误绑定到其他正式章节。
- 如果正式章节已经有正文，拆章重排或连接修复默认不得清空正文或重置执行状态。
- 如果旧数据没有 `chapterId` 且章序/标题无法可靠匹配，应创建新的正式章节并写回连接，而不是静默保持悬空规划。
- 如果执行合同质量门禁不通过，应阻断连接到章节执行区，并提示具体章节缺少的规划信息。

## Related Modules

- `VolumeChapterPlan.chapterId` 连接正式 `Chapter`。
- 卷工作区读取和保存由 `NovelVolumeService` 负责维持 canonical 字段。
- 章节连接修复由 `VolumeChapterSyncService` 和 `buildVolumeSyncPlan` 负责。
- 前端节奏拆章和章节执行是同一章节身份的两个视图，不是两套需要用户手动同步的列表。
