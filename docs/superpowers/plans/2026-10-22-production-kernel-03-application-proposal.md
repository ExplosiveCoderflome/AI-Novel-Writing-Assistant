# 计划 03：应用层与持久化提案

状态：2026-10-22 用户明确要求“继续下一步，直到计划完成”，批准本提案的新增表和临时库验证，进入实施。合入 beta/main 或迁移已有作品库仍遵守路线图的单独验收流程。

## 要解决的问题

纯领域进度只能表达“下一步应做什么”。崩溃恢复还必须持久保存配置快照、阶段状态、最终选稿和必要的运行中制品。新表按“同一调用方作业 + 章节”区分，不能全书每章永久共用一行，否则手动重审、重新生产和新批次会错误复用旧结果。

## 拟新增的唯一持久表

```prisma
model ProductionUnitRun {
  id                     String   @id @default(cuid())
  ownerKey               String
  novelId                String
  chapterId              String
  profileSnapshotJson    String
  policySnapshotJson     String
  modelSnapshotJson      String
  progressJson           String
  stageArtifactsJson     String
  activeStage            String?
  activeRequestKey       String?
  version                Int      @default(1)
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
  novel                  Novel    @relation(fields: [novelId], references: [id], onDelete: Cascade)
  chapter                Chapter  @relation(fields: [chapterId], references: [id], onDelete: Cascade)

  @@unique([ownerKey, chapterId])
  @@index([novelId, chapterId])
}
```

- `ownerKey` 是调用方注入的稳定作业身份，内核不解析导演任务或 Seed。应用层负责核对 novelId/chapterId 与归属，不能凭客户端参数创建跨书记录。
- 三份 snapshot 保存本次执行的已解析配置；model snapshot 不保存 API 密钥、访问令牌或供应商原始响应。
- `progressJson` 保存领域进度，包括修复结果、最终选稿哈希、债务和回填状态。`stageArtifactsJson` 保存本作业恢复需要的草稿/候选及结构化评估，不写入 Chapter.riskFlags，也不建立第二套长期章节版本历史。
- 每个阶段的请求身份包括作业、阶段、正文哈希、实际输入指纹、Prompt/模型/配置版本；不能只看正文哈希命中。
- `version` 用于比较更新和领取阶段。所有模型请求在事务外；正文提交继续通过唯一生命周期写入口，并在真实事务里复核原文版本及所有权。
- Novel、Chapter 只增加对应关系数组；PostgreSQL 与 SQLite 各生成一个仅新增此表及索引/外键的迁移，不改已有正文或业务数据。

## 应用接口与执行顺序

1. `UnitProgressStore`：按 ownerKey/chapterId 创建或加载，校验快照与身份，通过期望版本保存领域动作和阶段制品。
2. `Fence`：请求前、长操作返回后、所有持久写入前核对调用方归属、取消、人工等待及正文版本。
3. `BudgetPort`：沿用已有计量语义；修复或重试必须先持久预约，再发真实请求。领域中已用次数不代替持久预约。
4. `StagePort`：每个阶段一个适配器；适配器复用冻结底层服务之前，先确认不会进入旧 V2 分支。若无法做到，按 G1 提交具体受影响代码和最小复制范围。
5. `runUnit`：读取进度、调用 decideNext、先保存纯动作或阶段领取、执行适配器、保存结果。已保存结果复用；远端请求已发出但结果尚未持久化的崩溃窗口按未知执行结果处理，不宣称物理调用严格一次。

## 验证计划

- 内存端口先验证执行循环和结果映射，不借此声明数据库事务通过。
- 新建临时 SQLite 执行迁移、比较更新、同作业重复调用、不同作业同章隔离及冲突写入测试，注册到 integration 分组。
- 在 draft、repair、commit 结果已保存后模拟退出，再恢复；核对已保存的模型结果不重复调用、选稿不改变、回填只补未完成步骤。
- 覆盖用户编辑、取消、人工暂停、失权、领取失败、结果保存失败及未知请求结果，不用清空真实库解决测试问题。
- 双 schema validate、服务端构建、领域回归、冻结目录及依赖方向检查。真实 PostgreSQL 执行与 UI/模型质量仍另行验收。

## 批准范围

需要确认的是：按上述模型新增 ProductionUnitRun，以及之后生成双数据库的新增迁移并仅在临时库验证。不会因此获得迁移已有作品库、整合分支或发布的授权。
