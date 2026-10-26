# 生产共用能力 04 Implementation Plan

> **For agentic workers:** 使用 executing-plans 在当前会话独立执行，无子代理。

**Goal:** 提供长短篇均可消费的安全补丁、质量债、停止语义、编辑围栏及输入/用量预算工具。

**Architecture:** common 仅拥有约定和确定性工具，不依赖领域、执行器、数据库或短篇。保存工具接收原子 CAS 回调；预算工具接收持久预约回调，不能用内存状态宣称具备持久化。

**Tech Stack:** TypeScript、node:test。

**Spec:** ../specs/2026-10-22-production-kernel-design.md 第 9 节；../inventory/production-kernel/04-common-and-short-story.md 第 3 节。

## Global Constraints

- 仅新增 common/index.ts 及其自有文件；不替换旧调用方；单文件最多 400 行。
- 约定只消费已结构化结论，不做关键词语义判断；运行记录只读。
- 原始债务字段无损保存；历史短篇字符串债务不推测严重程度或根因。
- 输入 token 为保守估算，必须连同系统消息、工具和输出预留计算；不声称是供应商精确计量。

## Task 1：安全补丁

Files: common/patches.ts、tests/production/common/patches.test.js。

- [x] 写测试：多补丁成功、不唯一、缺失、相交/嵌套、替换文本再次成为锚点、同锚点重复、删除、无变化、无补丁。
- [x] 缺失 export 红灯后实现 `applyTextPatches(original, patches)`。全部在同一原文定位，唯一性/重叠一次校验，按位置倒序应用；失败返回完整原文及结构化原因，不返回半成品。
- [x] 同一测试通过。

## Task 2：质量、停止与编辑约定

Files: common/quality.ts、common/fencedSave.ts、tests/production/common/contracts.test.js。

- [x] 写测试：长篇归因/义务/根因字段和短篇字符串完整 roundtrip；局部问题继续、全局重规划停止、显式人工暂停、没有可用正文失败。
- [x] `createQualityDebtEnvelope({longChapter?,shortStory?})` 只包装原始 JSON 数据且校验可序列化；`decideProductionStop` 只消费结构化作用域和人工策略。
- [x] `saveWithFence` 先检查任务 fence，再调用仓储原子 compareAndSave；冲突或人工编辑产生明确错误，不重试覆盖；成功后复查任务所有权。
- [x] fake CAS 测试证明其参数含版本与人工编辑基线；不将 fake CAS 当作数据库事务验收。

## Task 3：输入预算与持久预约合同

Files: common/budget.ts、tests/production/common/budget.test.js。

- [x] 写测试：输入+输出+余量边界、非法数值、未知上下文窗口、中文/表情计数、预算预约失败不调用模型、同 key 结果复用由持久端口负责。
- [x] `checkContextBudget` 对完整渲染输入 UTF-8 字节数做保守估算，可注入实际 tokenizer 计数；未知窗口不能当无限预算。
- [x] `invokeWithBudget` 调用顺序 reserve → fence → invoke；同请求 key 的幂等性由持久预约方保证。返回真实使用量需通过单独记录接口写入；失败也保留预约。
- [x] 新测试、领域回归、server build、导入/文件长度边界通过。

## Task 4：文档与验收

- [x] common README 说明边界和接入责任；Wiki 说明补丁一次定位、预算估算与原子保存合同。
- [x] 04 报告、中央记录、本地清单记录实际证据；不宣称任何长短篇入口已经切换。
