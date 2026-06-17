# 自动导演：角色候选自动确认

## 背景

章节生成完成后，`ChapterArtifactDeltaService` 会从生成内容中提取新出现的角色，以 `status: "pending"` 写入 `characterCandidate` 表。这些候选角色会以「只读占位符」的形式注入后续章节的 prompt（`pendingCandidateGuards`），并明确标注"在 repair flow 以外不得注入生成"。

在手动模式下，用户通过 UI 主动确认候选角色，确认后角色进入正式名册，`rebuildDynamics` 重建动态关系图。

**问题**：全自动导演模式（`runMode: full_book_autopilot`）下，没有任何自动确认机制。候选角色长期停留在 `pending` 状态，后续章节生成时该角色始终以「只读临时标签」而非「正式角色」身份存在于 prompt 上下文，导致：

- AI 无法为该角色写入个性、动机、成长弧
- 角色在多章节中出现时缺乏一致性锚点
- `rebuildDynamics` 不会将候选角色纳入卷级投影，动态关系图残缺

## 决策

在 `NovelDirectorAutoExecutionRuntime.runFromReady` 的自动执行循环中，每当一个 pipeline job 成功且仍有剩余章节需要执行时，在推进下一章之前自动确认所有 `pending` 候选角色。

错误用 `.catch(() => null)` 吞掉，不阻断主流程——候选确认失败不应让整个自动成书中止。

## 当前规则

### 触发时机

`job.status === "succeeded"` 且 `autoExecution.remainingChapterCount > 0` 时（即"本批次完成，循环继续"分支），调用 `autoConfirmPendingCandidates`，然后才 `continue autoExecutionLoop`。

### 自动确认策略

- 使用候选自身字段：`proposedName` → 角色名，`proposedRole` → 角色类型（默认 `"新角色"`），`summary` → 人物背景
- `castRole` 不设置（null）——保守默认，不强行判定主配角层级
- 多个候选批量创建角色后，只调一次 `rebuildDynamics`，避免 N 次重建

### 关键文件

| 文件 | 职责 |
|------|------|
| `CharacterDynamicsMutationService.autoConfirmPendingCandidates()` | 批量确认逻辑，单次 rebuildDynamics |
| `CharacterDynamicsService.autoConfirmPendingCandidates()` | facade 委托 |
| `novelDirectorAutoExecutionRuntimePorts.ts` | `autoConfirmPendingCandidates?` 可选端口 |
| `novelDirectorAutoExecutionRuntime.ts` | 注入调用点（pipeline succeeded 分支） |
| `NovelDirectorService.ts` | 接入点（生产路径） |
| `DirectorCoreStepModuleRuntime.ts` | 接入点（全书自动成书路径） |

### 可选端口设计

`autoConfirmPendingCandidates` 作为可选依赖注入 `NovelDirectorAutoExecutionRuntimeDeps`，测试环境或非自动成书流程可不注入，不影响现有行为。

## 失败模式

- **候选 `proposedName` 重复**：`createCharacter` 不做去重，可能产生同名角色。容忍度：概率低（同一本书通常不会同名候选），且下一章生成前 `rebuildDynamics` 会将重复角色合并进动态图。
- **rebuildDynamics 失败**：整个 `autoConfirmPendingCandidates` 被 `.catch(() => null)` 吞掉，候选保持 `pending`，后续章节继续以只读模式注入。不会崩溃，但问题不解决。如果持续失败应查看 `rebuildDynamics` 的 LLM 调用链。

## 关联模块

- `server/src/services/novel/runtime/ChapterArtifactDeltaService.ts` — 候选的来源，章节完成后写入 pending 候选
- `server/src/prompting/prompts/novel/chapterLayeredContextShared.ts` — `buildPendingCandidateGuardText()`，将 pending 候选注入 prompt 作只读占位
- `server/src/services/novel/director/automation/novelDirectorAutoExecutionRuntime.ts` — 调用点
