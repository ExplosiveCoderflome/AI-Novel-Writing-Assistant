# 章节生命周期持久化边界

## 背景

章节生产同时维护 `content`、`generationState` 和 `chapterStatus`。如果生成、审校、修复和资产同步分别直接写这些字段，同一次运行可能留下互相矛盾的状态，恢复逻辑也难以判断哪个结果可信。

## 当前规则

- `ChapterLifecycleService` 是章节 Runtime 内唯一允许直接写正文工作版本、`generationState` 和 `chapterStatus` 的持久化服务。
- 生成、审校和修复服务负责决定下一状态，但必须委托这里落库；它们不得直接调用 `prisma.chapter.update` 修改生命周期字段。
- 保存 `drafted` 或 `repaired` 正文时，正文、流水线状态和 `chapterStatus=generating` 必须在同一次更新中提交。
- 人工审校、自动审校和修复复审产生的质量标记、修复历史与章节生命周期状态，必须通过 `applyQualityAssessmentState` 在同一次更新中提交；质量闭环服务只负责计算结构化评估，不得直接写章节表。
- `generationState=approved` 必须通过 `mergeChapterPatchForGenerationStateBump` 同步得到 `chapterStatus=completed`，避免“流水线已通过但界面仍待处理”。
- 时间线、事实账本和资产回灌仍由各自服务负责；本服务只保存章节正文版本及生命周期字段，不吸收质量判断或后置资产逻辑。

## 范围边界

规划阶段创建章节、用户在编辑器中显式保存正文、版本恢复和下游重置具有不同的数据语义，不属于章节 Runtime 生命周期写入；这些入口仍应遵守各自的保护和版本规则。

## 失败排查

- 正文存在但状态仍为 `planned`：检查调用方是否绕过 `saveWorkingContent`。
- `generationState=approved` 但 `chapterStatus` 不是 `completed`：检查是否直接更新了单个字段。
- 修复稿已保存但页面仍显示旧正文：检查修复链是否委托生命周期服务后又被旧写入覆盖。
- 人工审校建议重规划却没有可恢复状态：检查质量评估是否同时写入 `riskFlags.qualityLoop`、`generationState=reviewed` 和 `chapterStatus=needs_repair`。
