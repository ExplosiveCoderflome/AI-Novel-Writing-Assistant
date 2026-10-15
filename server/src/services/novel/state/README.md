# 状态提案提交边界

## 责任

`StateCommitService.ts` 是兼容入口与应用编排：抽取提案、调用确定性校验、组织事务、应用获准提案，并生成 canonical 版本记录。外部调用方仍使用这个入口，不能深层导入内部持久化模块来确认提案。

- `domain/StateProposalPolicy.ts` 处理结构化提案的字段校验、来源质量、风险分流和版本摘要。它消费 AI 提案与审核结果，不通过关键词补判创作意图。
- `persistence/StateProposalStore.ts` 拥有提案行的 JSON 映射、查询、创建、待审核状态认领、冲突备注及版本关联；正文一致性查询和状态应用写入也在此执行。它不发起 AI 调用或决定审核策略。
- `application/CommittedProposalApplication.ts` 将已获准提案分派给角色资源账本或角色状态写入；调用方必须传递提交事务。账本的归属、可见性和事件规则继续由角色资源模块拥有。

## 事务与版本

确认已有提案时，在同一事务内读取 `pending_review` 提案、以 `id + novelId + pending_review` 条件认领，再应用状态。未认领成功的提案不能写入账本、事件或返回为已确认。应用失败时，状态认领与账本写入一起回滚。拒绝仍以待审核状态为条件，因此确认和拒绝竞争时只有一个能消费提案。

自动资源确认额外在事务内验证执行归属和已保存正文版本，并保留内容 hash、章节顺序与资源冲突检查。统一 V2 资源提案创建也保留小说版本、正文和事务内冲突门禁。此拆分不扩大自动确认权限。

提案、状态应用、canonical 快照读取、版本创建和 `committedVersionId` 关联使用同一事务客户端。快照必须看到本次刚应用的状态；版本或关联写入失败时全部回滚。没有成功认领的提案不创建空版本。`CanonicalStateService` 与 `StateVersionLog` 接受可选事务客户端，普通独立调用仍使用默认数据库连接。

角色状态和资源账本写入错误必须向上传播并回滚事务。读取资源失败不能伪装成空资源来生成不完整的版本快照。

## 验证

`server/tests/stateProposalReviewPersistence.test.js` 使用源码加载与内存依赖替身，验证重复确认、确认与拒绝竞争、事务失败和自动确认正文门禁，不连接数据库或模型。它验证应用层事务使用约定，不替代数据库引擎的并发隔离测试。

`server/tests/novelProduction/stateCommitAtomicSqlite.test.js` 使用独立临时 SQLite 注入版本创建、版本关联和角色更新故障，验证原子回滚与重试，并核对版本快照包含本次写入状态。此测试不覆盖 PostgreSQL 的隔离行为。
