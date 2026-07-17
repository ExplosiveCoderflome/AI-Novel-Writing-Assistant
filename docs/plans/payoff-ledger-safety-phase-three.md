# P0 基础安全闭环：幽灵承诺与重规划闸门

## 背景

Book Contract 阶段回报已经能够进入 Payoff Ledger，但合同内容被修改或移除后，旧账项仍可能作为正文义务保留。与此同时，重规划决策仍曾把 Payoff 逾期距离或当前章引用当作全局停机依据。这两处都属于既有合同没有完整闭合，而不是需要扩展新功能。

## 原因分类

主要原因：`incomplete closure`。

- AI 对账负责识别新旧承诺的语义关系，但同步落库缺少对已被替换固定来源的生命周期收口。
- `ReplanRecommendation` 已有动作层级，但部分确定性判断和调用方仍可能把局部质量债升级成全局重规划。
- 当前正常修改 Book Contract 和推进逾期 Payoff 的产品路径都可以复现，因此不能归类为只需清理一次的历史脏数据。

## 阶段边界

- 不增加 UI、数据库字段、状态枚举或产品流程。
- 不删除账本、正文、来源引用、证据或已兑现记录。
- 不执行迁移、回填、数据重置或其他数据操作。
- AI 继续负责语义归并；领域代码只对结构化 AI 输出执行确定性生命周期与安全闸门。

## Book Contract 来源生命周期

AI 对账完成后，对旧账项执行以下收口：

1. 只检查尚未终结、未被本轮输出复用、来源全部属于 `book_contract.*` 的账项。
2. 固定来源已从 Book Contract 移除，或同一固定来源已由新 ledger key 接管时，将旧账项标记为现有 `failed / 已失效`。
3. 保留旧账项标题、来源和证据，清理 `sync_stale`，写入 `source_superseded` 风险原因。
4. `paid_off` 和已经 `failed` 的账项不再处理；混合其他来源的账项保守保留。
5. 退役项跳过普通 stale 标记，重复同步保持幂等。

## 全局重规划闸门

决策优先级固定为：

1. 人工强制或 `nextAction=replan`：`stop_for_replan`。
2. 高优先级章节审计：`local_patch_plan`。
3. Payoff 逾期：`continue_with_warning`。
4. 无上述信号：继续执行。

逾期距离、当前章窗口命中或当前章引用都不是全局计划失配证据。章节验收确认 `plan_misalignment` 时，通过现有强制参数进入 `stop_for_replan`。所有全局调用方必须以 `action === "stop_for_replan"` 为最终条件。

## 兼容性

- `PayoffLedgerStatus`、数据库模型、API 返回结构和 `ReplanRecommendation` 结构保持不变。
- 账项退役复用 `failed / 已失效`；`source_superseded` 只是风险代码字符串，不增加公共枚举。
- 旧数据会在下一次正常 Book Contract 对账时收敛，无需一次性回填。

## 验收标准

- 来源替换、来源移除会退役旧账项；相同 key 复用、已兑现项、已失效项和混合来源项不会误退役。
- 退役账项不进入 pending、urgent、overdue，不生成开放 Payoff 冲突。
- 当前章涉及逾期承诺和严重逾期都只记录 warning；显式 `nextAction=replan`、人工强制和 `plan_misalignment` 仍停止。
- 高优先级审计只生成局部修复计划，不触发自动全局重规划。
- shared build、server typecheck/build、Payoff Ledger、重规划决策、章节 runtime 与 pipeline 聚焦测试通过，`git diff --check` 无错误。

## 实施状态

- [x] 固定来源生命周期策略与同步接入
- [x] 重规划动作优先级收紧
- [x] 全局调用方动作闸门
- [x] 生命周期、决策与运行时回归测试
- [x] 完成聚焦验证
- [x] 创建独立阶段提交
