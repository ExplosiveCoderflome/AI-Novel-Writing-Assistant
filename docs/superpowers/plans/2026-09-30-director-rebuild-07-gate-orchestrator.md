# 自动导演重构 · 计划 07：门控编排器与半自动（任务级，待细化）

状态：**代码实现完成，确认事务、编辑保护、失效范围、独立门控编排及显式恢复已验证；实际页面操作随计划 08 接通**。

执行定稿：用户授权继续完成全部计划，由当前执行者独立实施。生产图采用计划 05 的十步声明，非门控结果自动确认；停止映射保留计划 05 的结构化人工暂停和明确失败决定。切换只在已保存边界生效，未收尾的正文批次需先处理恢复事项。详见 `docs/wiki/workflows/director-next-assisted-gates.md`。

**目标：** 实现半自动的门控编排器：每个阶段产物完成后打开确认门并等待；用户编辑产物后，依赖它的下游产物自动失效并重新计算。

**依赖：** 计划 02（失效规则与 `gateable` 步骤）、计划 04（命令与执行循环）。

**设计文档：** 第 5.4 节（门控编排器）、第 12 节开放问题 4（失效规则）。

## Global Constraints

- 继承计划 00 第 3、6 节的全部约束。
- 门控编排器与计划编排器是**两个独立实现**，互相不引用，也不通过模式开关互相判断；两者只共用计划 01 的 `readySteps` 等纯函数。
- 门控编排器同样只实现 `Orchestrator` 接口：`next(input) → Action`，只读事实，不写库。
- **用户编辑后的失效由一个纯函数决定**：计划 01 已提供 `downstreamArtifactTypes(plan, type)`，必须直接使用，不得另写第二套下游计算。
- **章节正文永不因规划重算被清空或标为可覆盖**（正文不在计划内，`downstreamArtifactTypes` 不会返回它）；测试必须钉住这一点。
- 用户编辑后的产物必须登记为 `user_edited` 且 `protectedUserContent = true`，更新内容哈希与版本；守卫会拒绝任何覆盖它的步骤。
- 失效规则以计划 02 `04-invalidation-rules.md` 中**验收者最终确认的结论**为准；若有与默认提案不一致的产物类型，按确认结果在计划里写明，不得自行选择。
- 半自动的"门"来自 `gateable = true` 的步骤；新增阶段不需要修改门控编排器。
- 半自动只按**阶段**设门：规划阶段每个阶段产物一个门，正文按**批次**设门，不逐章。

## 需要新增的文件

| 路径 | 职责 |
| --- | --- |
| `server/src/modules/director/domain/gateOrchestrator.ts` | 门控编排器（纯函数） |
| `server/src/modules/director/application/gateService.ts` | `resolve_gate` 的处理：确认、编辑后确认、重新生成 |
| `server/tests/directorNext/gateOrchestrator.test.js` | 编排器单元测试 |
| `server/tests/directorNext/application/gateService.test.js` | 服务测试（真实 SQLite） |

## 编排器行为（定稿）

`next({ plan, contract, facts })`：

1. 有 `stopSignal` → 返回 `pause`（与计划编排器同一映射：`replan → replan`，其余 → `safety`）。
2. 存在"已产出但尚未确认"的 `gateable` 产物 → 返回 `open_gate`，`artifactTypes` 为这些产物类型（按计划顺序）。
3. 否则用 `readySteps(plan, facts, { requireConfirmed: true, stepIdsInScope })` 取就绪步骤；有则 `run_step` 第一个。
4. 范围内无剩余步骤 → `complete`。
5. 其余（无可执行步骤但仍有剩余）→ `pause`，`manual_recovery`，原因 `no_runnable_step`。

质量债不影响任何分支。

## Tasks（任务级）

| Task | 内容 | 验收 |
| --- | --- | --- |
| 1 | `gateOrchestrator.ts` 及单元测试 | 按上面 5 条行为逐条有测试；`next()` 纯函数；不 import 计划编排器 |
| 2 | 编辑后失效：`gateService` 在事务内先 `record` 用户编辑的新版本，再对 `downstreamArtifactTypes` 的结果 `markStale` | 测试：编辑 `story_macro` 后 `character_cast`、`volume_strategy`、`chapter_list` 均为 `stale`；编辑 `chapter_list` 后没有任何类型被标为 `stale`；章节正文产物不受影响 |
| 3 | `resolve_gate` 三种决定：`confirm` 把产物置为 `confirmed`；`confirm_after_edit` 按 Task 2 处理；`regenerate` 把该产物标为 `stale` 并使其下游失效 | 测试覆盖三种决定；版本冲突返回 409 |
| 4 | 崩溃恢复：在门打开、门等待、编辑后三个时点模拟崩溃，重启后重新 `next()` 仍得到一致的动作 | 测试通过，且不重复执行步骤 |
| 5 | 契约测试：假 agent 在半自动 Run 里提交"跳过未确认依赖直接执行下游"，守卫必须拒绝 `requires_unmet` | 测试通过 |
| 6 | 全自动与半自动互切：`handoff` 在已保存边界生效；切换后新 Run 从台账继续，不迁移状态 | 测试：切换前后产物台账完全一致；同一本书任意时刻只有一个活跃 Run |

## 停止条件

继承计划 00 的 G1～G6，另加：

| 编号 | 情况 |
| --- | --- |
| H1 | 失效规则在计划 02 中仍有未决的 `UNKNOWN` |
| H2 | 需要让门控编排器依赖计划编排器，或反之 |
| H3 | 需要在 `application/` 里另写一份下游失效计算 |

## 验收者检查项

1. 变异检查：让 `markStale` 额外标记章节正文产物，测试必须失败。
2. 变异检查：门控编排器使用 `requireConfirmed: false`，测试必须失败。
3. 确认 `gateOrchestrator.ts` 与 `planOrchestrator.ts` 之间没有 import。
4. 手工检查 `handoff` 前后的产物台账与控制行。
