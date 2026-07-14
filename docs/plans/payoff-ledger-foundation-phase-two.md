# Payoff Ledger 基础加固：第二阶段实施方案

## 背景

第一阶段已经把 Book Contract 的长期承诺下沉到章节写作上下文，并让章节细化、正文、验收和修复共用 `ReaderExperienceContract`。但 Book Contract 中第 3、10、30 章阶段回报尚未进入 Payoff Ledger 的同步来源，导致“写章看得到承诺，跨章账本却不一定知道承诺”。

这不是缺少新功能，而是现有合同没有闭环：Book Contract 更新只会刷新章节上下文缓存，已有 Payoff Ledger 不会因此重新对账。

## 阶段原则

本阶段只夯实已有基础，不扩展产品表面能力：

- 不增加页面、按钮、设置项或新的用户操作路径。
- 不增加独立读者评分、质量面板或新的全局重规划分支。
- 不新增数据库表或字段，不执行数据迁移。
- 不用关键词、正则或硬编码分支替代 AI 的语义归并和状态判断。
- 只补齐来源合同、持久副作用、幂等身份、历史兼容和回归验证。

## 原因分类

主要原因：`incomplete closure`。

证据：

- `PayoffLedgerSyncService` 读取 Story Macro、卷 open payoffs、章节 payoff refs、状态快照、冲突和审校问题，但没有读取 Book Contract。
- `BookContractService` 更新后只发出缓存失效事件，没有触发 Payoff Ledger 重新同步。
- `getPayoffLedger()` 只在账本完全为空时自动同步；已有账本不会因为 Book Contract 改动自动刷新。
- 当前正常保存 Book Contract 的产品路径可以持续复现该断点。

## 第二阶段目标

1. 将 Book Contract 的第 3、10、30 章回报作为稳定、可追溯的书级承诺来源送入现有 Payoff Ledger AI 同步。
2. 使用固定来源引用和明确目标窗口，让重复同步能够语义归并而不是产生重复账项。
3. Book Contract 的阶段回报发生变化时，通过现有持久副作用队列触发账本同步；普通字段变化不产生无意义同步。
4. AI 同步结果必须覆盖所有非空 Book Contract 阶段承诺；缺失来源时进入现有语义重试，不用静默兜底伪造账项。
5. 保留旧账本和旧来源枚举兼容，不引入数据库迁移。

## 稳定来源合同

Book Contract 阶段回报映射为三个结构化来源：

| 来源引用 | 目标窗口 | 含义 |
| --- | --- | --- |
| `book_contract.chapter3Payoff` | 第 1–3 章 | 开篇承诺的第一次明确回报 |
| `book_contract.chapter10Payoff` | 第 4–10 章 | 第一段稳定追读回报 |
| `book_contract.chapter30Payoff` | 第 11–30 章 | 长线开局阶段的核心兑现 |

这些窗口来自 Book Contract 已有字段的确定语义，属于结构化输入的确定性投影。账项是否与其他承诺合并、当前处于何种状态、是否已有兑现证据，仍由 AI 根据完整上下文判断。

来源统一使用现有 `major_payoff` 类型，并通过固定 `refId` 区分 Book Contract 来源，避免扩展数据库和公共枚举。

## 同步与幂等规则

- Book Contract 保存前比较三个阶段回报的规范化值，只在它们实际变化时安排 Payoff Ledger 同步。
- 同步通过现有 `NovelSideEffectJob` 持久队列执行，不在 HTTP 保存请求内等待 LLM。
- 副作用任务幂等键由小说、合同更新时间组成；同一次保存事件只产生一个任务。
- Worker 重试沿用现有租约、指数退避和 dead 状态规则。
- AI 输出通过固定 `refId` 证明已覆盖每个非空阶段承诺；遗漏时触发现有 semantic retry。
- 已存在账本在同步失败时继续保留，并沿用 stale 风险标记；不得删除用户已有数据。

## 数据流

```text
Book Contract 保存
  -> 比较 3/10/30 章回报是否变化
  -> book-contract:updated
  -> 持久副作用任务 payoff.bookContractSync
  -> PayoffLedgerSyncService 读取最新 Book Contract
  -> 已注册 AI Prompt 语义归并全部来源
  -> postValidate 检查固定来源覆盖与窗口
  -> 现有 PayoffLedgerItem 幂等 upsert
```

## 非目标

- 连续多章只铺垫不回报的独立检测器。
- 新的读者体验总分或排行榜。
- 新的质量债 UI、管理页面或人工编辑器。
- 自动改变 Book Contract 内容。
- 普通逾期承诺自动升级为全局重规划。

这些能力只有在基础来源、状态和同步稳定后，才适合进入后续阶段。

## 验收标准

- Payoff Ledger 同步 Prompt 能看到所有非空的 3/10/30 章回报及固定来源引用、目标窗口。
- AI 输出遗漏任一 Book Contract 来源引用时会失败并进入语义重试。
- Book Contract 阶段回报变化会入队一次持久同步任务；其他字段单独变化不会入队。
- Side-effect worker 可以执行该任务并调用现有 Payoff Ledger 同步服务。
- 重复事件由幂等键收敛，不创建重复任务。
- 旧账本、旧 Prompt 输出和旧来源类型仍能读取。
- shared build、server typecheck/build 与 Payoff Ledger、事件副作用聚焦测试通过。

## 实施状态

- [x] 原因分类与阶段边界确认
- [x] 2A Book Contract 来源合同
- [x] 2B 持久同步触发
- [x] 2C AI 输出覆盖校验
- [x] 2D 回归测试与 Wiki
- [x] 针对性验证
