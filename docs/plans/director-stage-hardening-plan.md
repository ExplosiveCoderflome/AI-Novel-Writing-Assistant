# 自动导演阶段知识加固方案（P0 加固项）

## 背景

2026-07 架构审查确认：小说生成主链的步骤模块体系（WorkflowStepModule + Registry + Catalog）契约良好，但"阶段身份"知识分散在至少四处独立持有：

- `server/src/services/novel/director/workflowStepRuntime/directorWorkflowPlans.ts` 的硬编码规划序列 `DIRECTOR_PLANNING_SEQUENCE`。
- `shared/types/novelWorkflow.ts` 的 `NovelWorkflowStage` 联合类型。
- `server/src/services/novel/director/recovery/novelDirectorRecovery.ts` 中 `resolveSafeDirectorPipelineStartPhase` 手写的阶段降级 if 链（约 45 行非穷举条件判断）。
- `server/src/services/novel/director/runtime/novelDirectorTakeover.ts`（1047 行）中 `phaseToEntryStep` / `entryStepToLegacyStartPhase` / `entryStepToWorkflowStage` / `buildSkipSteps` 等手写映射与约 15 处按阶段名硬编码的入口判定。

`"story_macro"` 等阶段字面量散布在 server + client + shared 共 62 个文件。**核心风险：新增一个阶段时，recovery / takeover 的 if 链与手写映射不会产生编译错误，只会在恢复或接管时静默跳错阶段。**

本方案是两个纯加固动作，为后续任何"新增前置模块"的需求（如紧张度曲线之后可能的读者期待规划等）扫清最危险的暗坑。

## 目标

1. **Part 1：穷举保护 + 新增阶段检查清单**——让"新增阶段但漏改 recovery / takeover"从静默错误变成编译错误或测试失败，并沉淀一份人工检查清单兜底。
2. **Part 2：步骤目录补编排元数据**——把阶段顺序与前置依赖作为数据沉淀进已有 catalog，用一致性测试钉住它与现有硬编码序列的一致，为将来的编排重构铺路。

## 不做的事

- 不改变 recovery / takeover 的任何现有判定行为——本方案所有改动在行为上恒等。
- 不让 recovery / takeover / planning 序列改为从 catalog 派生（那是下一阶段的编排重构，需要本方案的测试基线先落地）。
- 不拆分 `novelDirectorTakeover.ts` 大文件（独立事项，避免与本方案的行为恒等验证互相干扰）。
- 不动前端阶段导航。

## Part 1：穷举保护 + 检查清单

### 1a. 特征化测试先行（行为基线）

- `server/tests/novelDirectorRecovery.test.js`：为 `resolveSafeDirectorPipelineStartPhase` 补表驱动真值表用例——6 个阶段 × 资产存在性组合（hasStoryMacroPlan / hasBookContract / hasWorldSetupPrepared / hasCharacters / hasVolumeWorkspace+Plan）的代表性组合全覆盖，把当前 if 链的实际行为钉成基线。现有 16 个测试保留。
- `server/tests/novelDirectorTakeover.test.js`：为 `phaseToEntryStep` / `entryStepToWorkflowStage` / `buildSkipSteps` 补全量映射断言（每个输入枚举值都有期望输出），钉住现有行为。现有 13 个测试保留。

### 1b. 编译期穷举保护（行为恒等重写）

- `server/src/services/novel/director/recovery/novelDirectorRecovery.ts`：
  - `DirectorPipelinePhase` 联合类型旁新增穷举有序常量（形如 `DIRECTOR_PIPELINE_PHASE_ORDER`），用 `satisfies` 约束"数组元素恰好覆盖联合类型全部成员"，新增阶段未加入即编译报错。
  - if 链本体不改逻辑，仅在函数末尾对无法归类的阶段走 assertNever 式兜底（当前不可达，新阶段漏改时在测试期立刻炸出）。
- `server/src/services/novel/director/runtime/novelDirectorTakeover.ts`：
  - 将 `phaseToEntryStep` / `entryStepToLegacyStartPhase` / `entryStepToWorkflowStage` 三个手写 if 映射函数改为 `Record<完整枚举, 值>` 查表实现——`Record` 键穷举由类型系统强制，新增阶段/入口步骤漏配即编译报错。行为由 1a 的全量映射断言保证恒等。
  - `buildSkipSteps` 改为基于有序常量数组推导区间，替换手写顺序判断。
- 通用 assertNever 辅助若项目尚无统一出处，放 `server/src/utils/`（先查重，已有则复用）。

### 1c. 新增阶段检查清单（wiki）

- `docs/wiki/` 下新增《自动导演新增阶段检查清单》页面，按"Background / Current Rule / 触点清单 / Failure Modes"结构，穷举新增一个规划阶段必须触碰的位置：
  1. `shared/types/novelWorkflow.ts` stage 联合类型
  2. `shared/types/directorWorkflowStepCatalogData.ts` 目录条目（含 Part 2 的编排元数据）
  3. `directorWorkflowPlans.ts` 规划序列
  4. `novelDirectorStageNodeAdapters.ts` 阶段节点适配器
  5. `directorPlanningStepModules.ts` 步骤模块
  6. `novelDirectorRecovery.ts` 降级链与有序常量
  7. `novelDirectorTakeover.ts` 入口映射
  8. 投影层（`projections/novelDirectorProgress.ts` 等）
  9. 前端工作台导航（`client/src/components/layout/NovelWorkspaceRail.tsx` 等）
  10. 相关 prompt 素材分组（`server/src/prompting/materials/materialGroups.ts` 等）
- 清单同时注明：哪些触点在本方案后有编译期/测试保护，哪些仍靠人工（前端、投影、prompt 素材）。

## Part 2：步骤目录补编排元数据

### 2a. catalog 数据扩展（纯新增字段）

- `shared/types/directorWorkflowStepCatalogData.ts`：`WorkflowStepCatalogEntry` 新增编排元数据字段——同 stage 内的执行序号与前置步骤 id 列表（可选字段，向后兼容），为全部既有条目填值：candidate 4 步、planning 6 步、structuredOutline 3 步、execution 7 步 + contractSync 的现有真实顺序。
- `shared/types/directorWorkflowStepCatalog.ts`：新增按 stage 取有序步骤序列、按步骤取前置依赖的查询 helper。

### 2b. 一致性守卫测试（防止双源漂移）

- `server/tests/directorWorkflowStepCatalog.test.js`：新增断言——catalog 编排元数据推导出的规划序列与 `directorWorkflowPlans.ts` 的 `DIRECTOR_PLANNING_SEQUENCE` 实际组装结果一致；执行链序列与 `getDirectorExecutionStepModuleSequence` 各 flow 的实际模块顺序一致。任何一侧单独改动即测试失败，强制两处同步，直到未来编排重构收敛为单源。
- 该测试同时充当"新增阶段检查清单"第 2、3 项的自动化兜底。

## 执行顺序与验证

1. 1a 特征化测试 → 全量跑通（基线成立）。
2. 1b 穷举保护重写 → 1a 测试不允许任何断言变化（行为恒等证明）。
3. 2a catalog 元数据 + 2b 守卫测试。
4. 1c wiki 检查清单（引用 1b/2b 已落地的保护点）。
5. 验证：`server` typecheck + `node --test` 相关测试文件（novelDirectorRecovery / novelDirectorTakeover / directorWorkflowStepCatalog / directorWorkflowStepModules）。

## 验收维度

- **符合度**：所有改动行为恒等（1a 基线测试前后零变化）；catalog 字段纯新增无破坏。
- **完成度**：Part 1（1a/1b/1c）+ Part 2（2a/2b）全部落地为完成；1c 可最后补。
- **风险性**：重点确认 takeover 三个映射函数查表化后与原 if 实现的全量输入输出一致；recovery 真值表覆盖是否穷尽代表性组合；catalog 一致性测试是否真的能在单侧改动时失败。
