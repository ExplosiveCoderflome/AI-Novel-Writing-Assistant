# 正文生产内核 · 计划 02：领域层

状态：**本地实现并通过定向验证，尚未集成**。2026-10-22 完成计划 01 静态盘点后执行；39 项领域检查和 4 项内存变异检查通过，详见 `docs/superpowers/reports/production-kernel/02-2026-10-22.md`。用户已授权修正两处选稿契约并开始开发。本阶段只实现领域层，不切换真实生产入口。

**目标：** 在 `server/src/modules/production/domain/` 下实现长篇单章生产的纯类型、生产配置结构、单元状态机、决策器、候选选择和回放夹具。全部是纯函数，配齐测试。
**依赖：** 计划 01 验收通过；用户已确认设计文档。
**范围：** 只服务长篇章节。不包含作品级阶段，也不包含短篇类型（设计文档第 2 节）。

## 全局约束

- 继承计划 00 第 3 节的全部约束。
- 领域层只允许相对路径导入本目录内的文件、`../common`（共用约定，计划 04；若计划 04 尚未完成，先在 `domain/types.ts` 中定义 `QualityDebt` 与 `StopSignal`，计划 04 完成后改为从 `../common` 导入），以及 `zod`。不得出现 `prisma`、`fs`、`fetch`、`Date.now`、`new Date(`、`Math.random`、`process.env`、`console.`。
- 不导入 `shared/types/chapterRuntime` 等现有类型。领域类型独立定义；与现有类型之间的映射放到计划 03 的适配器里做。这样领域层不会被旧合同拖住。
- 测试放在 `server/tests/production/domain/*.test.js`，只 `require("../../../dist/modules/production/domain")`，不访问数据库，属于快速测试。
- 单个文件不超过 400 行。

## 文件清单

| 路径 | 职责 |
| --- | --- |
| `domain/types.ts` | `UnitRef`、`StageId`、`AcceptanceVerdict`、`QualityDebt`、`StopSignal`、`UnitProgress`、`UnitAction`、`IssuePolicySnapshot` |
| `domain/profile.ts` | `ProductionProfile` 的 zod schema、`defineProfile()`（带校验）、`isStageEnabled()` |
| `domain/unitMachine.ts` | 单元进度的状态转换：`applyStageResult(progress, result)`、`applyUnitAction(progress, action)`；非法转换抛 `InvalidUnitTransitionError` |
| `domain/decideNext.ts` | 决策器 `decideNext(input): UnitAction` |
| `domain/candidateSelection.ts` | `selectCandidate(original, candidate): { selected, reasonCode }` |
| `domain/rules/*.ts` | 决策器用到的具名规则，每条规则一个导出函数，按主题分文件 |
| `domain/replay.ts` | `replayDecisions(fixture): UnitAction[]`：按顺序把记录下来的阶段结论喂给决策器，返回每一步的动作 |
| `domain/index.ts` | 唯一出口 |

## 核心类型（定稿）

```ts
export interface UnitRef { novelId: string; chapterId: string; order: number }

export type StageId = "prepare" | "draft" | "accept" | "repair" | "verify" | "select" | "commit" | "reconcile";

export interface AcceptanceVerdict {
  contentHash: string;
  gateAvailable: boolean;              // false 表示审校系统不可用，不代表正文有问题
  issues: ReadonlyArray<{ code: string; severity: "low" | "medium" | "high" | "critical"; patchable: boolean }>;
  missingObligations: ReadonlyArray<{ kind: string; repairability: "patchable_obligation_gap" | "rewrite_needed" | "plan_misalignment" | "none" }>;
  replan: "none" | "local_window" | "global_book";   // 只读取 AI 的结构化结论
  factPreservation?: "preserved" | "authorized_correction" | "violated" | "unknown"; // 只在 verify 阶段出现
  proseRegression?: boolean;           // 候选稿新增严重表达问题，来自确定性检测
}

export interface UnitProgress {
  unit: UnitRef;
  completed: ReadonlyArray<StageId>;
  repairAttemptsUsed: number;
  original?: { contentHash: string; verdict?: AcceptanceVerdict };
  candidate?: { contentHash: string; verdict?: AcceptanceVerdict };
  selected?: "original" | "candidate";  // 最终选稿；commit 只写入这里选定的稿件
  selectedContentHash?: string;        // 选稿动作绑定的正文版本，恢复时不得重新猜测
  selectionReasonCode?: string;
  committedContentHash?: string;
  userEditedSinceStart: boolean;       // 由调用方的版本围栏结果写入
}

export type UnitAction =
  | { kind: "run_stage"; stage: StageId }
  | { kind: "select_final"; selected: "original" | "candidate"; contentHash: string; reasonCode: string }
  | { kind: "record_debt"; debts: QualityDebt[]; then: "commit" }
  | { kind: "pause_for_manual"; reason: string }
  | { kind: "stop_for_replan"; scope: "local_window" | "global_book" }
  | { kind: "fail"; reason: "no_usable_content" | "data_integrity" }
  | { kind: "done" };
```

计划 01 若发现字段不足，由我在补齐本计划时修改，执行者不得自行增删字段。

### 最终选稿规则（定稿）

`commit` 的唯一前提是 `selected` 已确定。`selected` 只有两种确定方式：

| 路径 | `selected` 何时确定 | 是否经过 `select` 阶段 |
| --- | --- | --- |
| 本轮未执行修复且没有候选稿：审校通过；或修复不适用、修复次数已用完，只记质量债 | 决策器返回 `select_final`，通过 `applyUnitAction` 保存 `selected = "original"`、正文哈希与原因 | 否 |
| 进入了修复：`repair → verify` 之后 | 由 `selectCandidate` 在原稿与候选稿之间选定，结果可能是 `"original"`，也可能是 `"candidate"` | 是 |

所以"候选稿不得提前落库"只约束已经产生候选稿的路径；没有候选稿时，原稿就是最终选稿，正常路径不会被阻断。

`decideNext` 不得修改输入。无候选稿路径通过显式 `select_final` 动作和纯函数 `applyUnitAction` 形成新进度；应用层先持久化进度，再计算下一动作。有候选稿路径由 `select` 阶段的结果通过 `applyStageResult` 保存同样的选稿字段。`commit` 必须校验所选稿的当前哈希与 `selectedContentHash` 一致。恢复读取已保存的选稿，不重新选稿；重复应用完全相同的选稿动作保持幂等，改变已确定的选稿必须拒绝。

修复额度只决定是否允许再次进入 `repair`。本轮已经产生有效变化候选稿时，无论额度是否耗尽，都优先完成 `verify → select`；不得因额度耗尽而丢弃候选稿、跳过复验或覆盖已经保存的选稿。修复失败或正文完全未变时，按下方无有效候选的规则保留原稿。

## Tasks

| Task | 内容 | 必测行为（每条至少一个测试） |
| --- | --- | --- |
| 1 | `types.ts`、`profile.ts` | 配置缺少 `accept` 却启用了 `repair` 时，`defineProfile` 抛错；`repair.maxAttempts` 只能是 0 或 1；`stages` 顺序必须符合状态机顺序；重复 ID 校验读取调用方显式传入的已定义 ID 集合，不建立模块级隐含注册表 |
| 2 | `unitMachine.ts` | 无修复路径在 `accept` 后先应用 `select_final` 再进入 `commit`；合法序列 `prepare→draft→accept→repair→verify→select→commit→reconcile` 可以走通；`selected` 未确定或哈希不符时不能进入 `commit`；选稿进度序列化再恢复后仍提交同一稿；同一选稿动作重复应用幂等、冲突选稿拒绝；没有 `accept` 不能进入 `repair`；`verify` 之前必须有 `repair`；`commit` 之后不得再进入 `repair`；非法转换抛 `InvalidUnitTransitionError` |
| 3 | `candidateSelection.ts` | 候选稿新增 high 或 critical 问题时保留原稿；候选稿新增未兑现义务时保留原稿；`factPreservation` 为 `violated` 或 `unknown` 时保留原稿；`proseRegression` 时保留原稿；候选稿审校不可用时保留原稿；候选稿减少阻塞问题且没有新增严重风险时采用候选稿；只有分数提高、没有结构化改善时保留原稿；问题的身份按 `code` 比较，不按描述文字比较 |
| 4 | `decideNext.ts` 与 `rules/` | 见下方"决策器必测行为"；计划 01 验收后补齐全部规则 |
| 4b | `replay.ts` 与回放夹具 | 在 `server/tests/production/domain/fixtures/` 下至少放 5 份夹具，每份是"阶段结论序列加期望动作序列"的 JSON：直接通过；修复后采用候选稿；修复后保留原稿；审校不可用；需要全书重规划。回放结果必须与期望完全一致；同一夹具回放两次结果相同 |
| 5 | `index.ts` 与边界测试 | 领域层文件只有相对导入和 `zod`；不含上面列出的禁用调用；每个文件不超过 400 行 |

### 决策器必测行为（第一批，来自现有 wiki）

1. 没有正文时，下一步是 `draft`；`draft` 之后仍没有正文时，返回 `fail: no_usable_content`。
2. 审校通过且本轮未修复、没有候选稿时，先返回绑定原稿哈希的 `select_final`；该动作已保存后，下一步是 `commit`，不经过 `repair`、`verify`、`select`。
3. 存在可修复的问题、修复次数未用完、配置启用了 `repair` 时，下一步是 `repair`。
4. 本轮未执行修复且没有候选稿时，额度耗尽不再修复，通过 `select_final` 选定原稿，记录质量债后进入 `commit`。本轮已经执行修复时，即使 `repairAttemptsUsed === maxAttempts`，仍必须完成 `verify → select`，允许采用通过核对且更好的候选稿；额度耗尽不改变已保存的选稿。
5. 只有 `gateAvailable=false`、没有其他问题时，不修复，记录复查类质量债。
6. 配置的修复模式为 `detect_only` 时，永不进入 `repair`。
7. `replan=global_book` 时返回 `stop_for_replan`。`replan=local_window` 不停止整本，而是记录质量债，再由调用方处理窗口重规划。
8. 只有 `plan_misalignment` 类缺失义务、且 AI 结论为需要重规划时，才返回 `stop_for_replan`；`patchable_obligation_gap` 走修复或质量债。
9. 问题策略为 `pause_for_manual` 且出现阻塞问题时，返回 `pause_for_manual`；策略为继续时，记录质量债并继续。
10. 正文可用时，局部质量问题永远不会产生 `fail`。
11. `userEditedSinceStart=true` 时，不得进入 `repair` 或 `commit` 覆盖用户内容，返回 `pause_for_manual`，原因为用户已修改。
12. 已经产生候选稿（执行过 `repair`）时，`select` 完成之前 `commit` 不可达；没有候选稿时不受此限，原稿按第 2、4、5 条直接成为最终选稿。
13. `commit` 完成后，若配置启用 `reconcile` 则进入 `reconcile`，否则 `done`。
14. 同一输入调用两次，返回完全相同的动作（纯函数，没有隐含状态）。

### 盘点补齐的领域测试（2026-10-22）

- R054/R075/R108/R109/R180：发出修复即耗用次数；失败、无变化不退款；有变化候选先复验选稿，无变化复用原评估，不再发模型请求。
- R015/R016/R056/R087/R125：候选身份和复验身份必须匹配；新增严重问题、缺失义务、未知事实保持、表达退化或审校不可用均保留原稿；只有分数提高不能换稿。
- R012/R014/R017/R066/R067/R070/R071/R072/R104：继续策略留下质量债，显式人工策略暂停，全书重规划才停止；局部窗口交回调用方，不用统计数量升级停机。
- R019/R060/R133：审校不可用不伪造分数、不触发无依据修文；缺少可信复验时保留原稿。
- R027/R028/R229/R268：最终选稿绑定正文哈希；序列化恢复、重复动作和用户编辑保护必须有效。领域层只判断输入事实，真实数据库围栏在计划 03 验证。
- R022/R023/R024/R025：回填 pending 仍可重入，只有 completed/明确 degraded 形成完成；failed 不伪装成正常完成。

`repair` 已执行但失败或正文完全未变时，不存在新的有效候选稿：记录修复结果，显式选原稿并保留质量债。只有非空且与原稿不同的候选稿才进入 `verify → select`。这继承现有无变化候选不重复验收的规则，不扩大修复额度。

领域类型允许增加上述测试需要的显式事实：修复结果、质量债已保存标识、回填结果。状态转换返回新对象；`record_debt` 也通过纯函数 `applyUnitAction` 保存，防止恢复后重复登记。纯配置校验接受显式 ID 集合；阶段结果采用判别联合，校验所有正文身份，不把恢复所需状态藏在执行器内部。

## 验收命令

```powershell
pnpm --filter @ai-novel/server build
node --test (Get-ChildItem server/tests/production/domain -Recurse -Filter *.test.js | % FullName)
```

## 停止条件

在计划 00 的 G1～G6 之外，再加两条：

| 编号 | 情况 |
| --- | --- |
| P1 | 实现某条必测行为需要读取数据库、时钟或环境变量 |
| P2 | 两条必测行为互相矛盾 |

## 验收者检查项

1. 变异检查：把"修复最多一次"改成两次、删掉 `factPreservation` 判断、让 `local_window` 也返回停止、让审校通过的路径也必须经过 `select` 才能 `commit`，测试都必须失败。
2. 用 `rg` 检查领域层的导入和禁用调用。
3. 逐条核对必测行为都有对应的测试名称。
