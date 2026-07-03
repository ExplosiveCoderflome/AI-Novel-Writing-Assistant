# 自动导演新增阶段检查清单

## Background

自动导演的阶段身份同时影响规划链路、恢复起点、接管入口、任务投影、前端导航和 prompt 素材装配。新增一个规划阶段时，如果只改步骤模块或只改工作流序列，系统可能在恢复或接管时跳到错误阶段，或者让前端与后端状态显示不一致。

这份清单用于约束未来新增自动导演阶段的维护范围。它不是发布记录，而是阶段知识的边界说明：新增阶段必须同时更新类型、目录、运行时入口、投影和可见导航，并用现有守卫测试证明旧行为没有漂移。

## Current Rule

新增自动导演阶段时，先更新共享阶段类型和步骤目录，再补齐运行时序列、节点适配、恢复降级与接管映射。后端运行时相关触点必须具备编译期穷举保护或测试保护；前端导航、投影文案与 prompt 素材仍需要人工检查。

如果新增阶段只是内部过渡步骤，也必须判断它是否会进入 `NovelWorkflowStage`、是否需要可恢复起点、是否允许用户从接管入口启动，以及是否需要在任务中心或 AI 驾驶舱中可见。

## 触点清单

1. `shared/types/novelWorkflow.ts`
   - 更新 `NovelWorkflowStage` 等共享阶段联合类型。
   - 保护方式：TypeScript 联合类型会推动依赖处重新编译，但不会自动说明业务顺序。

2. `shared/types/directorWorkflowStepCatalogData.ts`
   - 新增或调整 catalog 条目，并填写 `orchestrationOrder` 与 `prerequisiteStepIds`。
   - 保护方式：目录元数据测试会校验依赖 step id 存在，并和运行时计划顺序保持一致。

3. `server/src/services/novel/director/workflowStepRuntime/directorWorkflowPlans.ts`
   - 同步规划链或执行链中的阶段顺序。
   - 保护方式：catalog 编排元数据与实际 plan 组装结果有一致性守卫测试，单侧改动会失败。

4. `server/src/services/novel/director/phases/novelDirectorStageNodeAdapters.ts`
   - 为新阶段补节点适配器，明确输入、输出、阶段完成条件和运行上下文。
   - 保护方式：步骤模块与节点适配的运行测试覆盖需要随新增阶段补齐。

5. `server/src/services/novel/director/workflowStepRuntime/directorPlanningStepModules.ts`
   - 为规划阶段注册对应 `WorkflowStepModule`，并确认模块 id、阶段名、上下文写入位置一致。
   - 保护方式：步骤模块序列测试会暴露缺失模块或顺序漂移。

6. `server/src/services/novel/director/recovery/novelDirectorRecovery.ts`
   - 更新恢复降级链和 `DIRECTOR_PIPELINE_PHASE_ORDER`。
   - 保护方式：有序阶段常量具备编译期穷举约束，恢复真值表测试会钉住资产组合下的安全起点。

7. `server/src/services/novel/director/runtime/novelDirectorTakeover.ts`
   - 更新接管阶段到入口步骤、入口步骤到旧起点、入口步骤到工作流阶段的映射。
   - 保护方式：映射使用完整 `Record` 查表，新增枚举漏配会编译失败；全量输入输出测试会防止行为漂移。

8. `server/src/services/novel/director/projections/novelDirectorProgress.ts` 等投影层
   - 判断任务中心、AI 驾驶舱、恢复入口和进度摘要是否需要显示新阶段。
   - 保护方式：目前主要依赖人工检查。新增可见阶段时必须补投影测试或最小状态样例。

9. `client/src/components/layout/NovelWorkspaceRail.tsx` 等前端工作台导航
   - 判断新阶段是否需要导航入口、激活态、进度提示或恢复入口。
   - 保护方式：目前主要依赖人工检查。前端可见阶段还需要遵守低认知负担原则，避免让新手用户理解内部阶段名。

10. `server/src/prompting/materials/materialGroups.ts` 等 prompt 素材分组
    - 判断新阶段是否需要新的素材组、上下文装配规则、结构化输出 schema 或 prompt registry 条目。
    - 保护方式：目前主要依赖人工检查。新增 product-facing prompt 必须走 `server/src/prompting/` 注册体系。

## Failure Modes

- 只更新 plan 序列，不更新 catalog 元数据：一致性测试会失败，表示阶段顺序出现双源漂移。
- 只更新共享阶段类型，不更新 recovery：编译期穷举检查或恢复真值表测试会失败。
- 只更新接管入口常量，不更新 takeover 映射：`Record` 穷举约束会在编译期暴露缺失映射。
- 新阶段影响用户可见进度，但未更新投影或前端导航：后端测试可能通过，但用户会看到阶段缺失、进度停滞或恢复入口不清晰；这类问题必须通过触点 8 和 9 人工检查。
- 新阶段需要新的上下文素材，但未更新 prompt 素材分组：生成链可能拿不到必要上下文，表现为 AI 输出结构正确但内容质量下降；这类问题必须通过触点 10 和阶段级 prompt 测试检查。

## Related Modules

- `shared/types/novelWorkflow.ts`
- `shared/types/directorWorkflowStepCatalogData.ts`
- `shared/types/directorWorkflowStepCatalog.ts`
- `server/src/services/novel/director/workflowStepRuntime/directorWorkflowPlans.ts`
- `server/src/services/novel/director/workflowStepRuntime/directorPlanningStepModules.ts`
- `server/src/services/novel/director/recovery/novelDirectorRecovery.ts`
- `server/src/services/novel/director/runtime/novelDirectorTakeover.ts`
- `server/src/services/novel/director/projections/novelDirectorProgress.ts`
- `client/src/components/layout/NovelWorkspaceRail.tsx`
- `server/src/prompting/materials/materialGroups.ts`

## Source Documents

- `docs/plans/director-stage-hardening-plan.md`
