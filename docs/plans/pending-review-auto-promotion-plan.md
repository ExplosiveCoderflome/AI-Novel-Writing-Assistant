# 待确认状态提案自动放行方案

## 背景

`StateCommitService` 里 `relation_state_update`（角色关系）和 `information_disclosure`（信息认知状态）两类提案属于 `ALWAYS_REVIEW_TYPES`，设计上永远不走自动提交，必须人工确认才能生效进入正史。

2026-07 对生产库（`server/dev.db`，web 模式默认 SQLite）做过一次只读核查，结果：

- `pending_review` 总量 2390 条
- 按类型：`information_disclosure` 1818、`relation_state_update` 410、`character_resource_update` 162、`character_state_update` 0
- 按积压时长：≥30 天 2044 条、14-30 天 346 条、<14 天 0 条；最老约 76 天，最新的也已经 14.11 天
- 按来源（`sourceQuality`，见下方关联方案）：debt 0 条，说明这批积压和质量债务路由无关，是长期存在的存量问题

结论：这套"永远人工审核"的机制实际上从未被真正清空过，`relation_state_update` + `information_disclosure` 占积压总量 93%。角色关系分数变化、信息认知状态变化长期没有真正生效进入正史，很可能是章节连贯性问题（尤其是关系推进感、角色对信息的反应前后矛盾）的一个被忽视的根因，规模上比角色资产账本积压大一个数量级。

## 关联方案

本方案复用 [quality-debt-provenance-routing](../../server/src/services/novel/state/stateProposalSourceQuality.ts) 已落地的 `StateChangeProposal` 提案体系（`sourceQuality`、`pending_review` 状态、`commitExistingProposals` 提交路径），不新建平行的提案系统。

## 目标

给 `relation_state_update` / `information_disclosure` 补一个有边界的自动放行策略，把"永远堆积的人工审核黑洞"变成"长期无冲突信号的提案会被自动放行，有风险信号的仍然卡人工"。

**不做的事**：

- 不处理现有 2390 条历史积压。历史积压是独立问题，需要单独的、显式手动触发的一次性工具处理，不属于本方案范围，也绝不能被本方案的自动逻辑碰到。
- 不改变章节生成、审校、修复的任何控制流。这是章节生成主链之外的后台维护动作。
- 不新增单独的提案状态值，复用已有的 `pending_review` / `committed` / `rejected`。

## 不可协商的安全底线

这个功能涉及批量、自动地把此前被判定为"需要人工确认"的状态变更提交为正史事实，且影响的是其他人（本仓库是开源多人协作项目）的数据库。以下四条是设计约束，不是可选项：

1. **默认关闭**。合并进主干后，任何人 `pull` 下来直接运行，功能处于关闭状态，行为与代码不存在这个功能完全一致。
2. **只处理"生效时间点之后"新产生的提案**。开关首次开启时记录一个基准时间戳；自动放行逻辑只考虑 `createdAt` 晚于该时间戳的提案。开启功能本身，不会让任何一条历史积压被自动处理。
3. **开启前必须走强制知情确认**，不是一个可以无意中点亮的普通 toggle。
4. **所有自动动作留痕、可追溯**，不是安静地改一个状态字段。

## 分步执行计划

### Part A：设置开关与生效基准时间

- `server/src/services/settings/qualityDebtSettingKeys.ts`（新文件，参考 `ragSettingKeys.ts` 写法）
  定义 `QUALITY_DEBT_AUTO_PROMOTION_ENABLED_KEY`、`QUALITY_DEBT_AUTO_PROMOTION_BASELINE_AT_KEY`。

- `server/src/services/settings/QualityDebtSettingsService.ts`（新文件，参考 `RagRuntimeSettingsService.ts` 的 DB 存储 + 默认值兜底模式）
  - 默认值：`enabled = false`，`baselineAt = null`。
  - 启用方法不接受简单的 `setEnabled(true)`，要求调用方显式传入知情确认凭证（例如请求体里带 `acknowledgedRisks: true` 加一段固定确认文案回传），服务端校验不通过直接拒绝写入。
  - `baselineAt` 只在首次启用时写入当前时间，重复启用调用不覆盖已有基准时间。
  - 服务初始化读到 `enabled = true` 时，打一条 **warning 级别**启动日志（不是 info），确保无 UI 场景/日志巡检也能第一时间发现这个功能是开着的。

- 设置面板（参照 `/settings` 现有分区新增一块）
  - 开关默认不可直接点亮；点击后先弹出说明弹窗，内容至少包含：功能做什么、明确写清楚"不处理现有历史积压，只影响开启之后新产生的提案"、明确写清楚"放行的提案会被当作正史提交、不会自动撤销"。
  - 弹窗要求用户主动勾选"我已了解上述风险"或输入确认文本，才能真正点亮开关。
  - 开关处于开启状态时，用醒目样式（不是普通说明文字）常驻显示当前已启用，不能开完之后就没有任何持续提示。

### Part B：分组与策略常量

- `server/src/services/novel/state/pendingReviewAutoPromotionPolicy.ts`（新文件）
  策略常量：积压多少天才有资格自动放行（建议 14 天，对齐这次核查里"14 天以内一条都没有"的观察）、单次运行最多处理多少条（防止历史批量场景下一次性处理过多）。

- `server/src/services/novel/state/stateProposalSubjectKey.ts`（新文件）
  纯函数：从 payload 算出"同一件事"的分组键——`relation_state_update` 用 `sourceCharacterId + targetCharacterId`，`information_disclosure` 用 `holderType + holderRefId + fact`。用于识别"更新的提案覆盖旧提案"。

### Part C：预演与执行服务

- `server/src/services/novel/state/PendingReviewAutoPromotionService.ts`（新文件，独立于 `StateCommitService`，方便单测和单独调用）
  - `preview(novelId, { since })`：只读。按分组键分组后，返回三类结果——会被放行的候选、会被标记覆盖（同一分组里更早、被更新提案取代）的候选、因命中 `OpenConflict` 未解决记录而跳过的候选。不做任何写操作。
  - `apply(novelId, { since, dryRun })`：真正执行。`dryRun = true` 时行为等同 `preview`，不产生任何数据库写入。非 dry-run 时：
    - 同分组内较早的提案标记为 `rejected`，理由写"已被更新提案覆盖"。
    - 通过冲突检测的最新候选，复用已有的 `StateCommitService.commitExistingProposals` 提交，不重新发明提交逻辑。
    - 命中未解决冲突的候选保持 `pending_review` 不动。
  - 每次非 dry-run 执行，写一条留痕事件（见 Part D）和一条包含具体数量的 **warning 级别**日志。

### Part D：留痕与可追溯

- 复用已有的 `DirectorAutomationLedgerEventService`（已用于 `ChapterQualityLoopService` 的质量闭环事件记录）
  新增事件类型 `pending_review_auto_promotion`，记录 `novelId`、放行/覆盖的提案 id 列表、判定依据（命中/未命中的冲突记录、分组键）、执行时间。保证几个月后复查某条关系/认知状态为何是这样时，能查到自动化判断过程，而不是一个不可解释的黑箱改动。

### Part E：接入自动导演（必须在 A/B/C/D 都验证完成后再做）

- `server/src/services/novel/director/automation/novelDirectorAutoExecutionRuntimePorts.ts` + `novelDirectorAutoExecutionRuntime.ts`
  只有 `QualityDebtSettingsService.isEnabled()` 为真时，才在现有 `autoConfirmPendingCandidates` 调用旁边追加对 `PendingReviewAutoPromotionService.apply` 的 fire-and-forget 调用（同款 `.catch(() => null)`，不影响当前批次成败）。关闭状态下这行代码等于不存在。

### Part F：发布说明

- `docs/releases/release-notes.md` / `README.md`
  这条更新单独用项目已有的 `warn` 提示块呈现，不与普通功能更新混在一条 bullet 列表里。明确标注"默认关闭、涉及自动提交此前需人工确认的状态变更、启用前请阅读说明"。

## 明确排除的范围

- 现有 2390 条历史积压的处理——单独立项，需要一个只能手动调用、强制先跑 `preview` 才能跑 `apply` 的一次性工具，不挂在任何自动或定时触发点上。
- `character_resource_update` / `character_state_update` 两类提案——它们已经有各自的风险/置信度判定路径（`CharacterResourceValidationService` 的低置信度判定、`sourceQuality=debt` 强制转审），不在本方案调整范围内。

## 测试范围

- `QualityDebtSettingsService`：默认 `enabled = false`；未携带知情确认凭证的启用请求被拒绝，状态不变；`baselineAt` 只在首次启用时写入，重复启用不覆盖。
- `PendingReviewAutoPromotionService.preview`：只统计 `createdAt` 晚于 `since` 的提案，基准时间之前产生的一律不出现在结果里，即使内容符合条件。
- `PendingReviewAutoPromotionService.apply`：`dryRun = true` 不产生任何数据库写操作（用会在写操作时报错的 mock prisma 验证零调用）；非 dry-run 时同分组只放行最新一条，其余标记覆盖；命中未解决冲突的候选不被放行。
- 留痕：每次非 dry-run 执行都产生对应的 ledger 事件与 warning 日志，内容包含足够信息还原判断依据。
- 自动导演接入点：开关关闭时，`PendingReviewAutoPromotionService` 完全不会被调用（断言调用次数为 0）。

## 风险与应对

| 风险 | 等级 | 应对 |
|---|---|---|
| 别人 pull 代码后无意触发 | 低 | 默认关闭 + 强制知情确认，代码合并本身不产生任何行为变化 |
| 开启后误伤历史存量数据 | 低 | baseline 机制保证只处理开启时刻之后的新提案 |
| 冲突检测存在盲区，放行了实际有问题的提案 | 中 | 这是权衡后的改善方向而非零风险——现状是"错误信息完全不生效"，改完是"错误信息有一定概率被自动放行"；建议先观察一段时间的 Part D 留痕数据再决定是否扩大范围 |
| 开启后想反悔，已放行的提案无法自动复原 | 中 | 本方案不含自动回滚工具；可以依据 Part D 留痕日志人工核对、手动改回状态；如后续认为必要，可以再立一个"根据留痕日志反向操作"的辅助脚本 |
| 提案对应章节和小说当前进度差距过大，放行意义不大甚至错位 | 待定 | 本版方案未纳入"提案章节与当前最新章节距离"的门槛判断，如果后续观察发现这是实际问题，可以在 Part B 的策略里追加 |

## 验收标准

- Part A-D 完成并通过测试后，功能应在任何人的本地环境里保持完全无感（关闭状态）。
- 手动开启后，`preview` 输出的候选列表人工抽查应该是合理的（关系变化确实是最新的、确实没有关联的未解决冲突）。
- 手动开启并执行 `apply` 至少一个观察周期后，Part D 的留痕数据应能完整还原每一条自动决策的依据。
- 存量积压（2390 条）在整个验收过程中应保持不变，不受本方案任何环节影响。
