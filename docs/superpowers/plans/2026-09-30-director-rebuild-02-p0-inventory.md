# 自动导演重构 · 计划 02：P0 只读盘点

> **给执行者：** 本计划**只读代码、只写文档**，不修改任何源码、测试、schema。产出是 4 份文档。不要猜测：任何一项找不到依据，就写 `UNKNOWN` 并附上具体问题，由验收者决定。

**目标：** 为新内核的步骤计划、继承规则、停止边界、失效规则提供有依据的输入。

**设计文档：** `docs/superpowers/specs/2026-09-30-director-rebuild-design.md`（第 5、10、12 节）

**分支与目录：** `refactor/director-rebuild`，`D:\code\ai-director-rebuild`。

## Global Constraints

- **只允许创建**下面 4 个文件，不得创建或修改其他文件：
  - `docs/superpowers/inventory/director-rebuild/01-step-graph.md`
  - `docs/superpowers/inventory/director-rebuild/02-inherited-rules.md`
  - `docs/superpowers/inventory/director-rebuild/03-stop-boundaries.md`
  - `docs/superpowers/inventory/director-rebuild/04-invalidation-rules.md`
- 每一条结论必须带**来源**：`相对路径:行号`（行号是你打开文件时看到的真实行号）。没有来源的结论不允许出现。
- 不得新增、改写或"纠正"任何代码。发现旧代码的问题，只记录在文档末尾的"发现的问题"里。
- 不得从记忆或经验补全。看不懂或找不到就写 `UNKNOWN: <具体问题>`。
- 文档用中文，表格用 Markdown。
- 提交信息以 `优化：` 开头，只 `git add` 这 4 个文件。纯文档，不更新发布说明和 README。

## 停止条件

| 编号 | 情况 |
| --- | --- |
| G1 | 需要修改这 4 个文件之外的任何文件 |
| G6 | 计划里指出的路径不存在，或内容与描述明显不符 |
| S1 | `UNKNOWN` 项超过任一文档条目总数的 30% |

## 需要阅读的文件（已核实存在）

| 用途 | 路径 |
| --- | --- |
| 阶段与步骤目录 | `shared/types/directorWorkflowStepCatalogData.ts`、`shared/types/directorWorkflowStepCatalog.ts` |
| 工作流阶段类型 | `shared/types/novelWorkflow.ts` |
| 运行时产物类型 | `shared/types/directorRuntime.ts` |
| 问题动作与问题码 | `shared/types/directorIssue.ts` |
| 计划组装 | `server/src/services/novel/director/workflowStepRuntime/directorWorkflowPlans.ts` |
| 规划步骤模块 | `server/src/services/novel/director/workflowStepRuntime/directorPlanningStepModules.ts` |
| 执行步骤模块 | `server/src/services/novel/director/workflowStepRuntime/directorExecutionStepModules.ts` |
| 步骤模块契约 | `server/src/services/novel/director/workflowStepRuntime/WorkflowStepModule.ts` |
| 阶段节点适配 | `server/src/services/novel/director/phases/novelDirectorStageNodeAdapters.ts` |
| 恢复 | `server/src/services/novel/director/recovery/novelDirectorRecovery.ts` |
| 接管 | `server/src/services/novel/director/runtime/novelDirectorTakeover.ts` |
| 产物盘点 | `server/src/services/novel/director/runtime/DirectorWorkspaceArtifactInventory.ts` |
| 问题治理 | `server/src/services/novel/director/issues/DirectorIssueService.ts` |
| 子系统说明 | `server/src/services/novel/director/README.md` |
| 规则来源 | `docs/wiki/workflows/auto-director-runtime.md`、`docs/wiki/workflows/chapter-production-chain.md`、`docs/wiki/workflows/lazy-chapter-planning.md` |

---

### Task 1：步骤依赖图（`01-step-graph.md`）

**Files:**
- Create: `docs/superpowers/inventory/director-rebuild/01-step-graph.md`

**要求：** 把旧链路的每一个阶段 / 步骤转成设计文档第 5.1 节的声明格式。

- [ ] **Step 1：通读上表"阶段与步骤目录""计划组装""规划步骤模块""执行步骤模块"四类文件**

- [ ] **Step 2：输出一张总表**，每个旧步骤一行，列固定为：

| 列 | 含义 |
| --- | --- |
| `旧步骤编号` | 旧代码里的 step id / 阶段名（逐字） |
| `建议新 id` | 小写下划线，如 `story_macro` |
| `中文名` | 面向用户的名称，取自旧代码里已有的用户文案；没有则写 `UNKNOWN` |
| `requires` | 需要的产物类型列表，来自旧代码的 `prerequisiteStepIds` 与产物检查 |
| `produces` | 产出的产物类型（一个步骤只能产出一种） |
| `needs` | 需要的模型能力；只能填 `structured_output`、`long_context`、`none`，依据旧代码里该步骤是否调用结构化输出 |
| `gateable` | 半自动下是否适合作为确认门：旧代码里已有对应审核检查点则为 `true` |
| `overwrites` | 会覆盖的产物类型；依据旧代码里的保护逻辑（`protectedUserContent`） |
| `复用的底层服务` | 步骤内部实际调用的服务函数，格式 `文件:函数`；不得写"旧导演运行时"或编排器 |
| `来源` | `路径:行号`，至少两处（目录处与实现处） |

- [ ] **Step 3：再输出一张"产物类型表"**：`产物类型`、`对应旧 DirectorArtifact 类型或业务表`、`是否用户可编辑`、`审阅页路由（旧代码里已有的则填，否则 UNKNOWN）`、`来源`。

- [ ] **Step 4：画依赖关系**：用文本列出每个步骤的直接上游，并自检**无环**；如果发现旧数据里存在环或 `produces` 冲突，写进"发现的问题"。

- [ ] **Step 5：明确区分"规划链路"和"正文生产"**：章节批次相关步骤单独成一节，并列出它与 `startPipelineJob` / `resumePipelineJob` 的接触点（文件:行号）。

- [ ] **Step 6：提交**

```powershell
git add docs/superpowers/inventory/director-rebuild/01-step-graph.md
git commit -m "优化：盘点自动导演旧阶段并整理步骤依赖图"
```

---

### Task 2：继承规则核对（`02-inherited-rules.md`）

**Files:**
- Create: `docs/superpowers/inventory/director-rebuild/02-inherited-rules.md`

- [ ] **Step 1：取设计文档第 10 节"必须继承的旧规则（初稿）"中的每一条**，逐条编号 R01、R02……

- [ ] **Step 2：对每一条规则，在代码中查找实际执行它的位置**，输出表格：

| 列 | 含义 |
| --- | --- |
| `编号` | R01… |
| `规则原文` | 逐字照抄设计文档 |
| `执行位置` | `路径:函数名:行号`；如果只在 wiki 里出现而代码没有执行，写 `仅 wiki` |
| `执行方式` | 一句话：是守卫、状态迁移、策略快照还是别的 |
| `新内核归属` | 只能填：`守卫`、`状态迁移表`、`编排器`、`步骤内部`、`投影`、`不在新内核范围`（章节内部算法等） |
| `备注` | 找不到依据、与 wiki 冲突时写明 |

- [ ] **Step 3：对"仅 wiki"和"与 wiki 冲突"的规则**，在文档末尾单独列出，供验收者决定保留与否。

- [ ] **Step 4：提交**

```powershell
git add docs/superpowers/inventory/director-rebuild/02-inherited-rules.md
git commit -m "优化：核对自动导演必须继承的旧规则"
```

---

### Task 3：停止边界清单（`03-stop-boundaries.md`）

**Files:**
- Create: `docs/superpowers/inventory/director-rebuild/03-stop-boundaries.md`

**目标：** 找出旧链路里**所有会让整本书停下来**的位置，并与"允许停止"的名单对照。

允许让全书暂停或失败的情形只有：明确的 `stop_for_replan` / `replan_required`；无可用正文；运行时安全风险；数据完整性风险；受保护用户内容冲突；用量熔断；质量优先策略下统一决策为 `pause_for_manual`；用户显式取消。

- [ ] **Step 1：在 `server/src/services/novel/director/` 下搜索**以下写入点，并逐处记录：

```powershell
rg -n "pendingManualRecovery" server/src/services/novel/director --glob "!*.test.*"
rg -n "replan_required|stop_for_replan|PIPELINE_REPLAN_REQUIRED" server/src/services/novel/director --glob "!*.test.*"
rg -n "markPendingManualRecovery|markFailed|markCancelled|fail_task|pause_for_manual" server/src/services/novel/director --glob "!*.test.*"
rg -n "usage_anomaly" server/src/services/novel/director --glob "!*.test.*"
```

- [ ] **Step 2：输出表格**，每处一行：

| 列 | 含义 |
| --- | --- |
| `位置` | `路径:函数:行号` |
| `触发条件` | 一句话，来自代码里的判断 |
| `效果` | 暂停（人工恢复锁）/ 失败 / 检查点 / 其他 |
| `归类` | 只能填：`允许（对应上面名单的哪一项）` 或 `疑似过度停止` |
| `依据` | 为什么这样归类，引用代码或 wiki 行号 |

- [ ] **Step 3：把"疑似过度停止"单独汇总成一节**，这是新内核必须消除的卡全书路径。

- [ ] **Step 4：提交**

```powershell
git add docs/superpowers/inventory/director-rebuild/03-stop-boundaries.md
git commit -m "优化：盘点自动导演旧链路的全部停止位置"
```

---

### Task 4：失效规则（`04-invalidation-rules.md`）

**Files:**
- Create: `docs/superpowers/inventory/director-rebuild/04-invalidation-rules.md`

**目标：** 确认半自动下"用户编辑某个产物后，哪些下游失效"。设计文档默认提案：按 `requires` 边传递失效；`chapter_draft` 永不因规划重算被清空或标为可覆盖。

- [ ] **Step 1：阅读** `shared/types/directorRuntime.ts`（产物类型与状态）、`DirectorWorkspaceArtifactInventory.ts`，以及在 `server/src/services/novel/director/` 下搜索：

```powershell
rg -n "stale" server/src/services/novel/director --glob "!*.test.*"
rg -n "user_edited|protectedUserContent" server/src/services/novel/director --glob "!*.test.*"
```

- [ ] **Step 2：输出表格**，每个产物类型一行：

| 列 | 含义 |
| --- | --- |
| `产物类型` | 与 Task 1 的产物类型表一致 |
| `谁会把它标为 stale` | 旧代码里触发点，`路径:函数:行号` |
| `标为 stale 时波及哪些类型` | 旧代码的实际行为 |
| `与"按 requires 边传递"是否一致` | 一致 / 不一致（说明差异） |
| `用户编辑后的处理` | 是否标 `user_edited`、是否 `protectedUserContent` |

- [ ] **Step 3：单独列出**所有与设计文档默认提案不一致的产物类型，由验收者决定以旧行为还是以提案为准。

- [ ] **Step 4：提交**

```powershell
git add docs/superpowers/inventory/director-rebuild/04-invalidation-rules.md
git commit -m "优化：盘点自动导演旧链路的产物失效规则"
```

---

### 执行报告模板

```markdown
## 计划 02 执行报告
- 分支 / 提交：
- 四份文档的条目数：01 步骤 N 行 / 产物类型 N 行；02 规则 N 条；03 停止位置 N 处；04 产物类型 N 行
- 每份文档中 UNKNOWN 的数量与占比：
- "发现的问题"汇总：
- 是否触发停止条件：无 / 哪一条
```

## 验收者检查项（执行者无需操作）

1. 每份文档随机抽查 5 条，打开来源 `路径:行号`，核对结论是否真实成立。
2. 步骤表里不得出现"编排器""旧导演运行时"作为复用的底层服务。
3. 停止边界表必须覆盖以上四条 `rg` 命令的全部命中，不得遗漏；遗漏即返工。
4. `git diff --name-only` 只能包含这 4 个文件。
5. 文档中不得有无来源的结论。
