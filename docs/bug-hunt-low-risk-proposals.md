# 低风险 Bug 排查 — 最终结论（工作流 + Codex 双重核验）

> **实施状态（本轮）**：Tier A 已修复 **11/12**（A9 暂缓——产品意图待确认）。新增 4 个测试文件（A3/A4/A8/A12 走 RED→GREEN）+ A1 guard 测试。
> 全量 server 测试 878 通过 0 失败 · client 36 通过 · 三端 typecheck/lint 全绿 · Codex 复审修复 diff 无 BLOCKER。
> 改动详见 `git diff`（12 源文件 +51 行）。Tier B/C/D 未动。
>
> 流程：9 路 `code-reviewer` 并行扫全库 → 每候选对抗式自验证 → Codex 独立第二意见 → 关键项作者亲自读码裁决。
> typecheck 全绿（无编译层 bug）。原始 30 候选 → 去重 21 确认 → Codex 讨论后重新分级如下。

## 🟢 Tier A — 可直接安全修（12 项，workflow + Codex 一致，机械修复零/低风险）

| # | 位置 | 问题 | 严重度 |
|---|------|------|--------|
| A1 | `directorExecutionStepModules.ts:241` | `Boolean(progress?.recoverableRange)` 恒为真（该字段是非空对象 `{startOrder:null,endOrder:null}`），`recoverable` 永远报 true → 应判 `startOrder !== null`。**作者已核验** | 产出错误 |
| A2 | `NovelWorkflowApplicationService.ts:528` | `recordCheckpoint` 唯一未用 `Math.max(existing.progress, …)` 的进度更新路径（其余 6 处都用），会让进度回退。**作者已核验** | 产出错误 |
| A3 | `prompting/core/contextSelection.ts:74` | `sortOptionalBlocks` 比较器方向反了，"该最先丢弃"的块反而被最先选中 | 产出错误 |
| A4 | `settings/ProviderBalanceService.ts:110` | `return response.json()` 未 await，`finally` 里的 `clearTimeout` 在读 body 前就触发 | 静默数据 |
| A5 | `cover/NovelCoverDialog.tsx:608` | 删除失败后按钮永久禁用（只看 `variables===id` 没看 `isPending`，react-query 的 variables 在失败后仍保留） | 产出错误 |
| A6 | `worlds/WorldWorkspace.tsx:493` | 两处 `useWorldLibraryItem(...).then()` 无 `.catch`，API 失败被静默吞掉 | 产出错误 |
| A7 | `creativeHub/hooks/useCreativeHubRuntime.ts:432` | `loadThread().then()` 无 `.catch`，网络错误时 UI 永久卡 loading | 产出错误 |
| A8 | `planner/replanDecision.ts:183` | surrounding 兜底分支锚点靠近第 1 章时返回的章节数少于请求数 | 产出错误 |
| A9 | `store/llmStore.ts:62` | `setSelection` 中 `temperature` 回退到旧值但 `maxTokens` 硬回退 `undefined`，不一致 | 静默数据 |
| A10 | `writingFormula/useWritingFormulaCreateFlow.ts:183` | `refreshStyleData().then()` 无 `.catch`，失败时自动打开回调丢失 | 次要 |
| A11 | `directorWorkflowStepShared.ts:129-137` | 重复的 `status==='running'` 兜底查找是死代码。**Codex 裁决：只删死重复，不要推断缺失状态**（对照全量 inspector 那处第一次查找更窄所以不是死的） | 静默数据 |
| A12 | `lib/directorTaskNotice.ts:26` **+ `task/adapters/NovelWorkflowTaskAdapter.ts:100`** | 恒真三元 `x==='open_structured_outline' ? 'open_…' : 'open_…'`。当前 union 只有一个合法值，今天无影响；建议收紧解析以拒绝不可信服务端数据。**Codex 发现服务端还有第二处** | 潜在/低 |

## 🟡 Tier B — 真 bug 但修复需谨慎/需决策（4 项，Codex 降级）

| # | 位置 | 为什么不是"零风险机械修" |
|---|------|--------------------------|
| B1 | `middleware/validate.ts:18,21` | **系统性**：query/params 的 `schema.parse()` 结果未写回 `req.query/req.params`，所有用 `z.coerce` 的查询路由（约 10 个文件）拿到的仍是原始字符串。**作者已核验**。但项目是 **Express 5**，`req.query` 是只读 getter，不能 `req.query = …`，修复要改共享中间件 + 兼容 v5（如 `req.validatedQuery` 或 `Object.defineProperty`），影响面大需测试 |
| B2 | `store/chatStore.ts:155` | `removeSession` 总把 `currentSessionId` 重置为第一个会话，删非当前会话时会误改选中项。**但** Codex 指出 `hydrate` 也可能恢复已不存在的 current，修复需同时检查 `prevCurrentId` 是否仍在 sessions 中 |
| B3 | `bookAnalysis/bookAnalysis.generation.ts:145` | `finally` 里的 DB 进度更新若自身抛错会顶替正在传播的 `AnalysisCancelledError`。但简单用 try/catch 包住会把"进度写入失败"从失败语义改成忽略——属策略选择，应只在已有 in-flight error/cancel 时防覆盖 |
| B4 | `rag/RagWorker.ts:53` | "无限循环"描述不成立（`Promise.all` 失败会退出循环）。真正问题是异常被 `void` 调用点静默吞掉、部分 job 卡 running；应加错误处理/日志而非"修死循环" |

## ⚪ Tier C — 经 Codex 核验后 == 非 bug / 纯外观（5 项，请勿"修"）

| # | 位置 | 结论 |
|---|------|------|
| C1 | `pipelineJobState.ts:196` `buildPipelineStageProgress` | **不是 bug！** `completed` 是已完成章节数，`stageFraction`(0.2/0.65/0.98) 是"当前章内子阶段进度"，`(completed+stageFraction)/totalCount` 正确。**工作流误报**——照其"修复"反而会引入 bug（第 1 章 finalizing 就报 98%）。**作者已读调用方裁决** |
| C2 | `novelDirectorAutoExecutionScopeRuntime.ts:66` 布尔恒真 | 零行为影响：`hasContract` 严格蕴含 `hasSynced`（前者要求全部字段、后者只要任一），两种写法都等价于 `!hasContract`。**作者已核验**。仅可读性 |
| C3 | `pipelineJobState.ts:355` | `getPipelineReplanNotice` 重复调用——纯函数，性能清理而非 bug |
| C4 | `novelDirectorAutoExecutionRuntime.ts:646` | 只 rethrow 的空 catch——cosmetic |
| C5 | `directorPlanningStepModules.ts:195` | 解构未用的 `state`——cosmetic |

## 🔵 Tier D — Codex 新发现 / 升级（建议纳入下一轮）

| # | 位置 | 问题 |
|---|------|------|
| D1 | `pages/novels/NovelEdit.tsx:130` | 前端活动解析白名单漏接 `artifact_delta`，但后端会写该类型（`ChapterArtifactBackgroundSyncService.ts:115`，标签已存在 `pipelineJobState.ts:20`）→ "资产回灌中"后台活动在章节执行 UI 消失。低风险可核实 |
| D2 | `runtime/ChapterArtifactBackgroundSyncService.ts:317` (原 R1) | 后台同步失败时 `clearBackgroundActivity` 清空活动，而非标记 `failed`；类型与前端都支持 `failed/error` → 失败活动丢失。Codex 升级为值得修 |
| D3 | `novelDirectorAutoExecutionRuntime.ts:63` + `DirectorCoreStepModuleRuntime.ts:255` (原 R5) | union 类型重复成员 `"chapter_batch_ready" \| "chapter_batch_ready"`。**仅删重复**，不要臆测加 `workflow_completed` |

## ⛔ 暂不动（需先定义语义）
- R2 `chapterRuntimePipeline.ts:263` `recoverableRepairFailure` 看似死检查，但被上游消费（`novelCorePipelineService.ts:759`），需先定义 repair-failure 语义，不是删代码。

---

## 附录：完整候选明细（含原始证据与建议修复）


> 来源：9 路 code-reviewer 并行扫描全代码库 → 每个候选独立对抗式验证。
> 验证门槛：isRealBug && fixIsSafe && risk in {zero,low} 三者全真才纳入。
> 结果：30 候选 → 去重后 21 个确认可修 + 8 驳回（4 误报 / 4 需决策）。typecheck 全绿。

严重度：🔴 crash · 🟠 wrong-output · 🟡 silent-data-issue · 🔵 minor · ⚪ cosmetic

---

## ✅ 确认可修（按严重度排序）

### 1. 🟠 Copy-paste bug: both branches of ternary return the same literal, unknown action types silently accepted

- 文件：`client/src/lib/directorTaskNotice.ts:26`
- 类别：copy-paste / wrong-variable bugs ｜ 严重度：wrong-output ｜ 修复风险：zero

**问题**：The ternary `notice.action.type === "open_structured_outline" ? "open_structured_outline" : "open_structured_outline"` is always `"open_structured_outline"` regardless of the actual value. Any invalid/unknown action type from untrusted server data is silently coerced to `"open_structured_outline"` instead of being rejected. The else branch was clearly meant to be a fallback that excludes invalid actions (e.g., return `null` for the whole `action` field or return a specific fallback type string).

**为什么是 bug**：The intent of the conditional is to validate that `notice.action.type` is a known value and only propagate it when valid. Since both branches produce the same value, an action with type `"some_future_type"` or any garbage value will be treated as `"open_structured_outline"`, causing `buildTaskNoticeRoute` and downstream logic to act on an action whose type was never actually validated. The type field of `DirectorTaskNoticeAction` is a discriminated union literal — this guard is meant to be the parser that enforces it.

**当前代码**：
```ts
type: notice.action.type === "open_structured_outline" ? "open_structured_outline" : "open_structured_outline",
```

**建议修复**：
```
Replace lines 24-34 in /Users/winson/Workspace/projects/AI-Novel-Writing-Assistant/client/src/lib/directorTaskNotice.ts:

```ts
action: notice.action && typeof notice.action === "object" && notice.action.type === "open_structured_outline"
  ? {
    type: "open_structured_outline" as const,
    label: typeof notice.action.label === "string" && notice.action.label.trim()
      ? notice.action.label.trim()
      : "快速修复章节标题",
    volumeId: typeof notice.action.volumeId === "string" && notice.action.volumeId.trim()
      ? notice.action.volumeId.trim()
      : null,
  }
  : null,
```

The existing outer guard `notice.action && typeof notice.action === "object"` was already present on line 24 — the fix just moves the type check into the condition that gates the entire object construction, rather than leaving it as a no-op ternary inside the object. Add `as const` to satisfy TypeScript's literal type for `DirectorTaskNoticeAction.type`.
```

---

### 2. 🟠 Delete button stays permanently disabled after a failed deletion

- 文件：`client/src/pages/novels/components/cover/NovelCoverDialog.tsx:608-624`
- 类别：wrong default value / wrong fallback ｜ 严重度：wrong-output ｜ 修复风险：zero

**问题**：The Delete button's `disabled` prop and its label use `deleteAssetMutation.variables === asset.id` without also checking `deleteAssetMutation.isPending`. In react-query, `variables` persists after mutation completes (both success and failure). After a failed deletion attempt the mutation is no longer pending but `variables` still equals the deleted asset's id, so the button remains disabled and still shows "删除中..." — the user can never retry.

**为什么是 bug**：react-query's `variables` field is set when mutate() is called and stays set until reset() is called or a new mutation starts. It is NOT cleared on completion. Without an `&& deleteAssetMutation.isPending` guard the condition evaluates to `true` even after the mutation has settled (failed or succeeded), freezing the button in the disabled / "deleting" state permanently after any failure.

**当前代码**：
```ts
disabled={deleteAssetMutation.variables === asset.id}
...
{deleteAssetMutation.variables === asset.id ? "删除中..." : "删除"}
```

**建议修复**：
```
Add `&& deleteAssetMutation.isPending` to all three affected expressions:

```tsx
// line 608 – "Set as primary" button guard (also blocked by failed delete, unblock it)
disabled={asset.isPrimary || setPrimaryMutation.isPending || (deleteAssetMutation.isPending && deleteAssetMutation.variables === asset.id)}

// line 617 – Delete button disabled prop
disabled={deleteAssetMutation.isPending && deleteAssetMutation.variables === asset.id}

// line 624 – Delete button label
{deleteAssetMutation.isPending && deleteAssetMutation.variables === asset.id ? "删除中..." : "删除"}
```

This is mechanical and unambiguous: the good path (while pending) is unchanged; the failure path now correctly re-enables the button; the success path is already handled by query invalidation removing the card.
```

---

### 3. 🟠 Two useWorldLibraryItem event-handler calls have no .catch — API errors are silently dropped

- 文件：`client/src/pages/worlds/WorldWorkspace.tsx:493-500`
- 类别：swallowed errors (empty catch / catch that hides a needed throw) that mask real failures ｜ 严重度：wrong-output ｜ 修复风险：zero

**问题**：The `onInjectLibraryField` and `onInjectLibraryStructure` prop callbacks both fire `void useWorldLibraryItem(...).then(() => invalidateWorld())` without a `.catch`. If the API call rejects (network error, server error), the error is silently swallowed: the user gets no toast or feedback, and `invalidateWorld()` is never called so the world view does not refresh.

**为什么是 bug**：A `.then`-only chain on a `void`-ed promise means any rejection propagates as an unhandled promise rejection. `invalidateWorld()` is only called in the success branch, so a failed inject leaves the UI stale without any indication to the user. Other mutations in the same file (`deleteMutation`, `publishLibraryMutation`, etc.) all use `onError: (error) => toast.error(...)`, establishing the pattern that errors should be surfaced.

**当前代码**：
```ts
onInjectLibraryField={(libraryId) =>
  void useWorldLibraryItem(libraryId, { worldId: id, targetField: selectedLayerMeta.primaryField }).then(
    () => invalidateWorld(),
  )
}
onInjectLibraryStructure={(libraryId, targetCollection) =>
  void useWorldLibraryItem(libraryId, { worldId: id, targetCollection }).then(() => invalidateWorld())
}
```

**建议修复**：
```
The proposed fix is correct and safe as written. Apply it directly:

```tsx
onInjectLibraryField={(libraryId) =>
  void useWorldLibraryItem(libraryId, { worldId: id, targetField: selectedLayerMeta.primaryField })
    .then(() => invalidateWorld())
    .catch((err) => toast.error(err instanceof Error ? err.message : '注入资料失败，请稍后重试。'))
}
onInjectLibraryStructure={(libraryId, targetCollection) =>
  void useWorldLibraryItem(libraryId, { worldId: id, targetCollection })
    .then(() => invalidateWorld())
    .catch((err) => toast.error(err instanceof Error ? err.message : '注入资料失败，请稍后重试。'))
}
```

This is a mechanical addition of a `.catch` handler consistent with the existing `deleteWorldMutation.onError` pattern in the same file. The success path (`invalidateWorld()`) is unchanged.
```

---

### 4. 🟠 removeSession always resets currentSessionId to first session, even when removing a non-current session

- 文件：`client/src/store/chatStore.ts:155-167`
- 类别：wrong default value / wrong fallback ｜ 严重度：wrong-output ｜ 修复风险：zero

**问题**：`removeSession` unconditionally sets `currentSessionId` to `sessions[0]?.id ?? ""` after filtering out the deleted session. When the removed session is not the currently active session, the active selection is incorrectly changed to the first remaining session, losing the user's current chat context.

**为什么是 bug**：When a user deletes a session that is NOT the currently active one, `getState().currentSessionId` still points to a valid remaining session. Setting `nextCurrent = sessions[0]?.id` replaces that valid current session ID with the first element of the list, jumping the user to a different conversation unexpectedly. The `currentSessionId` should only change when the removed session was the active one (or when the list becomes empty).

**当前代码**：
```ts
removeSession: async (sessionId) => {
  const sessions = getState().sessions.filter((session) => session.id !== sessionId);
  const nextCurrent = sessions[0]?.id ?? "";
  setState({
    sessions,
    currentSessionId: nextCurrent,
  });
```

**建议修复**：
```
In `removeSession` at line 155, replace:

```ts
removeSession: async (sessionId) => {
  const sessions = getState().sessions.filter((session) => session.id !== sessionId);
  const nextCurrent = sessions[0]?.id ?? "";
  setState({
    sessions,
    currentSessionId: nextCurrent,
  });
```

with:

```ts
removeSession: async (sessionId) => {
  const sessions = getState().sessions.filter((session) => session.id !== sessionId);
  const prevCurrentId = getState().currentSessionId;
  const nextCurrent = prevCurrentId === sessionId ? (sessions[0]?.id ?? "") : prevCurrentId;
  setState({
    sessions,
    currentSessionId: nextCurrent,
  });
```

The rest of the function (lines 162–167) remains unchanged.
```

---

### 5. 🟠 dropOrder sort comparator is inverted — first-to-drop groups get highest selection priority

- 文件：`server/src/prompting/core/contextSelection.ts:74-78`
- 类别：inverted boolean / wrong comparison operator ｜ 严重度：wrong-output ｜ 修复风险：zero

**问题**：In sortOptionalBlocks, the comparator `return leftDrop - rightDrop` sorts groups with smaller dropOrder index (= 'drop first') to the beginning of optionalBlocks. The selection loop fills from the beginning, so the 'drop first' groups are selected first and are the last to be evicted when budget runs out — exactly the opposite of the intended behaviour.

**为什么是 bug**：dropOrder[0] is semantically 'drop this group first when budget is exceeded'. A smaller index should produce a block that appears LATER in optionalBlocks (selected last, evicted first). With `leftDrop - rightDrop`, index-0 items get a negative result compared to higher-index items, so they sort to the front and are selected first, making them the last to be dropped. Usage in plannerPlan.prompts.ts confirms the intent: ['recent_decisions', 'character_dynamics', ...] lists least-important context first, but the bug causes recent_decisions to always be included before volume_summary.

**当前代码**：
```ts
const leftDrop = dropOrder.get(left.group) ?? Number.MAX_SAFE_INTEGER;
const rightDrop = dropOrder.get(right.group) ?? Number.MAX_SAFE_INTEGER;
if (leftDrop !== rightDrop) {
  return leftDrop - rightDrop;
}
```

**建议修复**：
```
Change line 77 from:
  return leftDrop - rightDrop;
to:
  return rightDrop - leftDrop;

This is a one-line, mechanical change that reverses only the dropOrder sort direction. No other logic is affected.
```

---

### 6. 🟠 chapterOrder stays a string after validate middleware — z.coerce.number() coercion is never applied to req.query

- 文件：`server/src/routes/novelPlanningRoutes.ts:65`
- 类别：wrong default value / wrong fallback ｜ 严重度：wrong-output ｜ 修复风险：zero

**问题**：The validate middleware writes coerced/parsed values back to req.body but never to req.query. The route casts req.query as z.infer<typeof payoffLedgerQuerySchema> which types chapterOrder as number, but at runtime it is still a raw Express string. The downstream service guard typeof options.chapterOrder === 'number' silently treats the string as absent, returning the full unfiltered ledger.

**为什么是 bug**：validate() calls schema.query.parse(req.query) but discards the result — req.query is never mutated (unlike req.body which is written). The schema uses z.coerce.number(), so after the middleware the typed value would be a number, but because req.query is never updated the cast is a lie. When chapterOrder=5 arrives, PayoffLedgerSyncService.getResolvedChapterOrder() executes typeof options.chapterOrder === 'number' → false on the string '5', falls through to the else branch, and the requested chapter filter is silently ignored.

**当前代码**：
```ts
const { chapterOrder } = req.query as z.infer<typeof payoffLedgerQuerySchema>;
```

**建议修复**：
```
Replace line 65 in server/src/routes/novelPlanningRoutes.ts:

Old:
  const { chapterOrder } = req.query as z.infer<typeof payoffLedgerQuerySchema>;

New:
  const { chapterOrder } = payoffLedgerQuerySchema.parse(req.query);

This is identical to the pattern already used correctly in novelCharacterDynamicsRoutes.ts and novelStorylineRoutes.ts, and is safe because the validate() middleware has already confirmed the query matches the schema — the re-parse here is a cheap, zero-throw operation that extracts the coerced number.
```

---

### 7. 🟠 `AnalysisCancelledError` re-thrown in `catch` can be silently replaced by a failing `await` in `finally`

- 文件：`server/src/services/bookAnalysis/bookAnalysis.generation.ts:145-169`
- 类别：swallowed errors (empty catch / catch that hides a needed throw) that mask real failures ｜ 严重度：wrong-output ｜ 修复风险：zero

**问题**：In the per-section try/catch/finally block, when `AnalysisCancelledError` is re-thrown (line 147), the `finally` block awaits `this.updateAnalysisProgress(...)`. If that DB call itself throws, JavaScript replaces the in-flight `AnalysisCancelledError` with the DB error. The outer catch at line 187 receives the DB error, misses the `instanceof AnalysisCancelledError` branch, and calls `markFailed` instead of `markCancelled`, leaving the analysis with `status='failed'` rather than `status='cancelled'`.

**为什么是 bug**：A JS `await` expression inside a `finally` block that rejects replaces the in-flight exception with the new rejection. So if the progress update DB call fails while `AnalysisCancelledError` is being propagated, the outer catch receives the DB error, skips the cancellation handling, and calls `markFailed`. The analysis is then recorded as permanently failed instead of cleanly cancelled, and the user sees a failed status when they expected a cancellation.

**当前代码**：
```ts
} catch (error) {
  if (error instanceof AnalysisCancelledError) {
    throw error;   // intends to propagate cancellation
  }
  ...
} finally {
  completedSections += 1;
  await this.updateAnalysisProgress(analysisId, {   // if this throws, AnalysisCancelledError is lost
    stage: "generating_sections",
    progress: getSectionStageProgress(completedSections, activeSections.length),
    ...
  });
}
```

**建议修复**：
```
In the finally block (lines 161-169), wrap the awaited DB call to prevent it from replacing an in-flight AnalysisCancelledError:

```typescript
} finally {
  completedSections += 1;
  try {
    await this.updateAnalysisProgress(analysisId, {
      stage: "generating_sections",
      progress: getSectionStageProgress(completedSections, activeSections.length),
      itemKey: section.sectionKey,
      itemLabel: formatSectionProgressLabel(index + 1, activeSections.length, section.title),
    });
  } catch {
    // Ignore progress update failures — they must not replace an in-flight AnalysisCancelledError
    // or mask a real section error. Progress accuracy is best-effort.
  }
}
```

This is purely mechanical: the try/catch wrapper silences transient DB failures in the progress update without affecting any other code path.
```

---

### 8. 🟠 recoverableRange object is always truthy even when range is empty

- 文件：`server/src/services/novel/director/workflowStepRuntime/directorExecutionStepModules.ts:241-245`
- 类别：wrong default value / wrong fallback ｜ 严重度：wrong-output ｜ 修复风险：zero

**问题**：Boolean(progress?.recoverableRange) is always true when progress is defined, because recoverableRange is always a non-null object {startOrder: null, endOrder: null}. This causes recoverable to incorrectly report true even when there are no recoverable chapters.

**为什么是 bug**：ChapterExecutionProgressSummary always contains recoverableRange as a non-null object {startOrder: number|null; endOrder: number|null}. When recoverableChapters.length === 0, startOrder and endOrder are both null, but the object itself is still truthy. Boolean({startOrder: null, endOrder: null}) === true. So recoverable is always true when progress exists, and the fallback reason message 'requires a new start point' is never shown, misleading the recovery flow into thinking it can always resume.

**当前代码**：
```ts
return {
            recoverable: Boolean(progress?.recoverableRange),
            resumeFrom,
            reason: progress?.recoverableRange
              ? "Chapter execution can resume from the latest observable progress."
            : "Chapter execution requires a new start point.",
```

**建议修复**：
```
Change line 241 from:
  recoverable: Boolean(progress?.recoverableRange),
to:
  recoverable: progress?.recoverableRange?.startOrder != null,

Change lines 243-245 from:
  reason: progress?.recoverableRange
    ? "Chapter execution can resume from the latest observable progress."
  : "Chapter execution requires a new start point.",
to:
  reason: progress?.recoverableRange?.startOrder != null
    ? "Chapter execution can resume from the latest observable progress."
    : "Chapter execution requires a new start point.",

This correctly checks whether at least one recoverable chapter exists (startOrder non-null) rather than whether the recoverableRange object exists (always true when progress is defined).
```

---

### 9. 🟠 recordCheckpoint can silently lower task progress

- 文件：`server/src/services/novel/workflow/NovelWorkflowApplicationService.ts:528`
- 类别：wrong default value / wrong fallback ｜ 严重度：wrong-output ｜ 修复风险：zero

**问题**：recordCheckpoint sets progress to `input.progress ?? defaultProgressForStage(input.stage)` without taking the max against the existing task progress. Every other similar update path uses Math.max to prevent regression. As a result, when the auto-quality gate blocks at an early stage (e.g. character_setup = 0.36) after the task has already advanced further (e.g. characterSetupReady = 0.42), the recorded checkpoint regresses the displayed progress.

**为什么是 bug**：All other calls that write `progress` in this service (lines 103, 162, 225, 274, 463, 563) use `Math.max(existing.progress, ...)`. Line 528 is the only exception. When `runDirectorCharacterSetupPhase` calls `recordCheckpoint` with `progress: DIRECTOR_PROGRESS.characterSetup (0.36)` after the task was already at 0.42, the stored progress drops to 0.36.

**当前代码**：
```ts
progress: input.progress ?? defaultProgressForStage(input.stage),
```

**建议修复**：
```
At line 528, change:
  progress: input.progress ?? defaultProgressForStage(input.stage),
to:
  progress: Math.max(existing.progress, input.progress ?? defaultProgressForStage(input.stage)),

This is identical in structure to the pattern used at lines 225, 274, 463, and 563. The variable `existing` is already available at line 509. No other changes are required.
```

---

### 10. 🟠 loadThread promise in useEffect has no .catch — UI gets permanently stuck on network error

- 文件：`client/src/pages/creativeHub/hooks/useCreativeHubRuntime.ts:432-445`
- 类别：swallowed errors (empty catch / catch that hides a needed throw) that mask real failures ｜ 严重度：wrong-output ｜ 修复风险：low

**问题**：The `useEffect` that loads the creative-hub thread fires `void loadThread(threadId).then(...)` with no `.catch`. If `loadThread` rejects (network error, API error), the rejection becomes an unhandled promise rejection, `setThreadStateLoaded(true)` is never called, and `threadStateLoaded` stays `false` forever. The returned `latestTurnSummary` value is conditionally `undefined` (instead of `null`) for the rest of the component's lifetime.

**为什么是 bug**：With no `.catch`, a rejected `loadThread` leaves `threadStateLoaded = false` (set to `false` two lines earlier on line 429) for the lifetime of the component. Callers rely on `threadStateLoaded` to distinguish "loading" from "loaded with no summary": `latestTurnSummary: threadStateLoaded ? (...) : undefined`. A permanently `false` flag makes the hub appear to be perpetually loading. The unhandled rejection also fires a global `unhandledrejection` event in the browser.

**当前代码**：
```ts
void loadThread(threadId).then((state) => {
  if (disposed) return;
  checkpointRef.current = state.checkpointId ?? null;
  // ...
  setThreadStateLoaded(true);
  currentRunIdRef.current = state.latestTurnSummary?.runId ?? null;
});
```

**建议修复**：
```
Append a `.catch` to the existing promise chain at line 445. The fix is additive only and does not alter the success path:

```ts
void loadThread(threadId)
  .then((state) => {
    if (disposed) return;
    checkpointRef.current = state.checkpointId ?? null;
    onCheckpointChange?.(state.checkpointId ?? null);
    setMessages(state.messages);
    setInterrupt(toLangGraphInterrupt(state.interrupts?.[0] ?? null));
    setRunArtifacts(state.latestTurnSummary ? [{
      runId: state.latestTurnSummary.runId,
      turnSummary: state.latestTurnSummary,
      debugEntries: [],
    }] : []);
    setThreadStateLoaded(true);
    currentRunIdRef.current = state.latestTurnSummary?.runId ?? null;
  })
  .catch((err) => {
    if (disposed) return;
    console.error('[useCreativeHubRuntime] loadThread failed', err);
    setThreadStateLoaded(true); // unblocks callers; add a dedicated error state if finer UI feedback is needed
  });
```

The `disposed` guard in `.catch` is necessary for the same reason it is in `.then`: the effect cleanup runs `disposed = true` on unmount or when deps change, preventing a stale state update after the component is gone.
```

---

### 11. 🟠 buildPipelineStageProgress mixes integer count and fractional stage offset

- 文件：`server/src/services/novel/pipelineJobState.ts:196-201`
- 类别：wrong default value / wrong fallback ｜ 严重度：wrong-output ｜ 修复风险：low

**问题**：stageFraction (a 0–1 decimal representing a fraction of total chapters) is added to completedCount (an integer chapter count) before dividing by totalCount, so its contribution to the result is stageFraction/totalCount instead of stageFraction.

**为什么是 bug**：PIPELINE_STAGE_PROGRESS maps stage names to fractions like 0.2 or 0.65, meaning '20% of total progress'. But the formula adds that 0.2 to completedCount (e.g. 3) and then divides by totalCount (e.g. 10), yielding (3.2)/10 = 0.32. The intent is clearly 3/10 + 0.2 = 0.5 (chapters done plus stage fraction). For a 10-chapter novel the stage contribution is 10x smaller than intended. The `|| completedBase` fallback only fires when the clamped result is 0 (which never happens in practice), so it provides no correction.

**当前代码**：
```ts
const completedBase = Math.max(0, input.completedCount) / input.totalCount;
  const stageFraction = PIPELINE_STAGE_PROGRESS[input.stage] ?? 0;
  return clampPipelineProgress(
    (Math.max(0, input.completedCount) + stageFraction) / input.totalCount,
    input.stage,
  ) || Number(completedBase.toFixed(4));
```

**建议修复**：
```
Replace lines 198-201 with:
  return clampPipelineProgress(completedBase + stageFraction, input.stage)
    || Number(completedBase.toFixed(4));

The full corrected function body becomes:
  if (input.totalCount <= 0) {
    return 0;
  }
  const completedBase = Math.max(0, input.completedCount) / input.totalCount;
  const stageFraction = PIPELINE_STAGE_PROGRESS[input.stage] ?? 0;
  return clampPipelineProgress(completedBase + stageFraction, input.stage)
    || Number(completedBase.toFixed(4));
```

---

### 12. 🟠 buildWindowOrders surrounding-mode fallback returns fewer chapters than requested when anchor is near chapter 1

- 文件：`server/src/services/planner/replanDecision.ts:183-193`
- 类别：off-by-one in slice/index/loop bounds ｜ 严重度：wrong-output ｜ 修复风险：low

**问题**：In the no-availableChapterOrders fallback branch, the surrounding-mode loop appends raw (duplicate) chapter numbers and counts them against `windowSize`, then deduplicates with uniqueNumbers before slicing. When anchorChapterOrder is small (e.g. 1 or 2), Math.max(1, anchor-distance) produces duplicates of chapter 1, so after deduplication the slice has fewer items than the requested windowSize.

**为什么是 bug**：Example: anchorChapterOrder=1, windowSize=3. After the loop fallbackOrders=[1,1,2], uniqueNumbers returns [1,2], .slice(0,3)=[1,2] — only 2 items instead of 3. The loop exits when fallbackOrders.length (raw, with duplicates) reaches windowSize=3, but after deduplication the result is shorter. The `buildReplanRecommendation` call at PlannerService.ts line 944 does not pass `availableChapterOrders`, so this fallback path is regularly exercised.

**当前代码**：
```ts
while (fallbackOrders.length < windowSize) {
  fallbackOrders.unshift(Math.max(1, anchorChapterOrder - distance));
  if (fallbackOrders.length >= windowSize) {
    break;
  }
  fallbackOrders.push(anchorChapterOrder + distance);
  distance += 1;
}
return uniqueNumbers(fallbackOrders).slice(0, windowSize);
```

**建议修复**：
```
Replace lines 185–192 in replanDecision.ts:

Before:
  while (fallbackOrders.length < windowSize) {
    fallbackOrders.unshift(Math.max(1, anchorChapterOrder - distance));
    if (fallbackOrders.length >= windowSize) {
      break;
    }
    fallbackOrders.push(anchorChapterOrder + distance);
    distance += 1;
  }

After:
  while (uniqueNumbers(fallbackOrders).length < windowSize) {
    fallbackOrders.unshift(Math.max(1, anchorChapterOrder - distance));
    fallbackOrders.push(anchorChapterOrder + distance);
    distance += 1;
  }

The mid-loop break is no longer needed because we now push both the left and right candidates unconditionally each iteration, and the loop condition checks the deduplicated length. The final .slice(0, windowSize) on line 193 remains unchanged as the correct termination guard.
```

---

### 13. 🟡 setSelection resets maxTokens to undefined when not provided, but preserves temperature — inconsistent fallback

- 文件：`client/src/store/llmStore.ts:62-64`
- 类别：wrong default value / wrong fallback ｜ 严重度：silent-data-issue ｜ 修复风险：zero

**问题**：In `setSelection`, `temperature` falls back to `state.temperature` when not present in the incoming selection, but `maxTokens` falls back to hardcoded `undefined` instead of `state.maxTokens`. Any caller that invokes `setSelection` without the `maxTokens` field will silently clear the user's previously configured `maxTokens`.

**为什么是 bug**：Both `temperature` and `maxTokens` are optional user preferences stored in the same store. The pattern used for `temperature` — preserve existing state value when caller omits the field — is the correct and intentional pattern for optional settings. The `maxTokens` line breaks this contract: `state.maxTokens` is discarded whenever any call to `setSelection` omits `maxTokens`. For example, if a user sets `maxTokens=8192` via `setMaxTokens()` and then provider/model selection changes trigger a `setSelection` call that does not carry `maxTokens` forward, the `maxTokens` setting is silently lost, reverting to the store's `undefined` default.

**当前代码**：
```ts
temperature: selection.temperature !== undefined
  ? normalizeTemperature(selection.temperature)
  : state.temperature,
maxTokens: selection.maxTokens !== undefined
  ? normalizeMaxTokens(selection.maxTokens)
  : undefined,
```

**建议修复**：
```
In client/src/store/llmStore.ts, change line 64 from:
  `: undefined,`
to:
  `: state.maxTokens,`

So the full block becomes:
```ts
maxTokens: selection.maxTokens !== undefined
  ? normalizeMaxTokens(selection.maxTokens)
  : state.maxTokens,
```

This mirrors the temperature pattern exactly and makes the partial-update contract consistent for both optional parameters.
```

---

### 14. 🟡 Missing `await` on `response.json()` in `try/finally` — clearTimeout fires before body is read

- 文件：`server/src/services/settings/ProviderBalanceService.ts:110`
- 类别：missing 'await' on a promise whose result is used ｜ 严重度：silent-data-issue ｜ 修复风险：zero

**问题**：`return response.json()` inside the `try` block is not `await`ed. In an async function, returning a promise (without await) causes the `finally` block to run before the promise settles. So `clearTimeout(timer)` fires as soon as HTTP headers arrive, stripping the 12-second AbortController timeout from the entire response-body-read phase.

**为什么是 bug**：In JavaScript, `return somePromise` (no await) inside async causes `finally` to run synchronously at the return statement — before the promise settles. Contrast with `return await somePromise` which holds in the try block until resolution. Here, `clearTimeout(timer)` fires on header receipt, long before the body is read. A server that streams headers quickly but the body slowly will never be aborted, violating the 12-second timeout contract for all three balance-fetch callers.

**当前代码**：
```ts
async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail.trim() || `请求失败（${response.status}）`);
    }
    return response.json();   // ← missing await
  } finally {
    clearTimeout(timer);       // ← fires before .json() resolves
  }
}
```

**建议修复**：
```
In `fetchJson` at line 110, change:

```ts
return response.json();
```

to:

```ts
return await response.json();
```

This is the complete fix. No other changes are needed.
```

---

### 15. 🟡 Duplicate 'running' lookup as last fallback in resolveCurrentScopedChapter is always dead

- 文件：`server/src/services/novel/director/workflowStepRuntime/directorWorkflowStepShared.ts:129-137`
- 类别：copy-paste / wrong-variable bugs ｜ 严重度：silent-data-issue ｜ 修复风险：low

**问题**：The function first sets `active` by searching for a chapter with `status === 'running'`. The fallback chain then tries `needs_repair`, `not_started`, and then searches for `status === 'running'` again. Since `active` already performed this search and was null (i.e., no running chapter), the repeated search on line 136 can never return a non-null value. A different status (likely `reviewable`, `approved`, or `blocked`) was intended as the final fallback.

**为什么是 bug**：The `active` variable is assigned by `chapters.find(s === 'running')`. When `active` is null, no chapter with status `running` exists. Therefore the 4th alternative `chapters.find(s === 'running')` can never produce a non-null result. This means when all chapters are in `reviewable`, `approved`, `completed`, or `blocked` status, `current` remains null, causing `currentChapterId` and `currentChapterOrder` in the returned `scopeChapterExecutionProgress` to be null. The intended fallback status was likely `reviewable` or `approved`.

**当前代码**：
```ts
const active = chapters.find((chapter) => chapter.status === "running") ?? null;
return active
  ?? chapters.find((chapter) => chapter.status === "needs_repair")
  ?? chapters.find((chapter) => chapter.status === "not_started")
  ?? chapters.find((chapter) => chapter.status === "running")
  ?? null;
```

**建议修复**：
```
Replace line 136 in `server/src/services/novel/director/workflowStepRuntime/directorWorkflowStepShared.ts`:

```typescript
// Before (line 136 — dead duplicate):
  ?? chapters.find((chapter) => chapter.status === "running")

// After:
  ?? chapters.find((chapter) => chapter.status === "reviewable")
```

Full corrected function:
```typescript
export function resolveCurrentScopedChapter(
  chapters: DirectorChapterExecutionProgressItem[],
): DirectorChapterExecutionProgressItem | null {
  const active = chapters.find((chapter) => chapter.status === "running") ?? null;
  return active
    ?? chapters.find((chapter) => chapter.status === "needs_repair")
    ?? chapters.find((chapter) => chapter.status === "not_started")
    ?? chapters.find((chapter) => chapter.status === "reviewable")
    ?? null;
}
```

This is mechanically safe: the current 4th fallback is provably unreachable (returns the same result as `null`), so replacing it with `"reviewable"` only adds behavior for the currently-null case. `activeChapterId`/`activeChapterOrder` in `scopeChapterExecutionProgress` are unaffected because they guard on `current?.status === "running"`.
```

---

### 16. 🟡 `requeueInterruptedJobs` has an unbounded `while(true)` loop — a partial DB failure leaves it running forever

- 文件：`server/src/services/rag/RagWorker.ts:53-72`
- 类别：swallowed errors (empty catch / catch that hides a needed throw) that mask real failures ｜ 严重度：silent-data-issue ｜ 修复风险：low

**问题**：`requeueInterruptedJobs` loops: query running jobs → updateAll to 'queued' → loop. If `Promise.all(...)` throws mid-way (transient DB error on a partial update), the exception propagates to the `void` call-site and is silently swallowed. Some jobs remain 'running', and the loop never finishes, blocking the async chain permanently and leaving the startup recovery half-done.

**为什么是 bug**：If Promise.all rejects (partial DB failure), the exception exits the current loop iteration but the function is called with `void` so the rejection is lost. The loop terminates via exception, but some jobs are left stranded in 'running' state. In normal operation the loop terminates in 2 iterations, but the lack of a cap means any transient DB problem during startup recovery results in permanently stuck jobs that will never be retried.

**当前代码**：
```ts
private async requeueInterruptedJobs(): Promise<void> {
  while (true) {
    const runningJobs = await this.ragIndexService.listJobs(500, "running");
    if (runningJobs.length === 0) { return; }
    ...
    await Promise.all(
      runningJobs.map((job) =>
        this.ragIndexService.updateJobStatus(job.id, { status: "queued", ... })
      ),
    );
  }
}
```

**建议修复**：
```
Wrap the body of `requeueInterruptedJobs` in a try/catch so failures are logged rather than silently dropped via `void`. The iteration cap is optional since the loop is already naturally bounded:

```ts
private async requeueInterruptedJobs(): Promise<void> {
  try {
    while (true) {
      const runningJobs = await this.ragIndexService.listJobs(500, "running");
      if (runningJobs.length === 0) {
        return;
      }
      this.logWarn("Requeue interrupted running jobs after restart.", {
        count: runningJobs.length,
      });
      await Promise.all(
        runningJobs.map((job) =>
          this.ragIndexService.updateJobStatus(job.id, {
            status: "queued",
            runAfter: new Date(),
            lastError: job.lastError ?? "RAG worker restarted; interrupted job requeued.",
          })
        ),
      );
    }
  } catch (error) {
    console.warn(
      "[RAG][Worker] requeueInterruptedJobs failed; some jobs may remain stuck in 'running'.",
      { error: error instanceof Error ? error.message : String(error) },
    );
  }
}
```

This is purely additive: the happy path is unchanged, and DB errors at startup are surfaced rather than silently dropped. No behavior change for the normal (no-error) case.
```

---

### 17. 🔵 getPipelineReplanNotice called twice with the same args — wasted computation but not a bug

- 文件：`server/src/services/novel/pipelineJobState.ts:355-358`
- 类别：copy-paste / wrong-variable bugs (used X where surrounding code clearly means Y) ｜ 严重度：minor ｜ 修复风险：zero
- (两个 scope 各发现一次：novel-runtime, novel-core)

**问题**：getPipelineReplanNotice(payload.replanAlertDetails) is called twice: once to check .noticeCode and again to get the full result. This is wasteful but not a correctness bug since both calls use identical arguments.

**为什么是 bug**：Not a correctness bug — both calls are idempotent with the same input.

**当前代码**：
```ts
const notice = job.status === "succeeded"
    ? (getPipelineReplanNotice(payload.replanAlertDetails).noticeCode
      ? getPipelineReplanNotice(payload.replanAlertDetails)
      : qualityNotice)
```

**建议修复**：
```
At line 354, after the qualityNotice assignment, add:
  const replanNotice = getPipelineReplanNotice(payload.replanAlertDetails);

Then replace lines 355-358 with:
  const notice = job.status === "succeeded"
    ? (replanNotice.noticeCode
      ? replanNotice
      : qualityNotice)

This eliminates the duplicate call while keeping identical semantics.
```

---

### 18. 🔵 refreshStyleData().then() in extraction success path has no .catch — auto-open callback is silently lost on error

- 文件：`client/src/pages/writingFormula/useWritingFormulaCreateFlow.ts:183-185`
- 类别：swallowed errors (empty catch / catch that hides a needed throw) that mask real failures ｜ 严重度：minor ｜ 修复风险：low

**问题**：After a writing-formula extraction task succeeds, the code calls `void refreshStyleData().then(() => { onAutoSavedProfileReady(profileId, ...) })` without `.catch`. If `refreshStyleData()` rejects, `onAutoSavedProfileReady` is never invoked, so the "auto-saved profile" notification and editor auto-open never happen, leaving the user with no confirmation that the extraction succeeded.

**为什么是 bug**：If `refreshStyleData` (which calls `queryClient.invalidateQueries`) throws, the `.then` callback is skipped. The caller `resetCreateFlow()` has already been called (line 182) so the form is cleared, but `onAutoSavedProfileReady` — which typically sets the selected profile and shows a success toast — is never called. The extraction result is effectively lost from the UI despite having completed successfully on the server.

**当前代码**：
```ts
void refreshStyleData().then(() => {
  onAutoSavedProfileReady(profileId, `写法"${profileName}"已自动保存，已经为你打开当前写法编辑。`);
});
```

**建议修复**：
```
Replace lines 182-186 with an async IIFE to properly handle the await/finally pattern inside the useEffect:

```ts
resetCreateFlow();
void (async () => {
  try {
    await refreshStyleData();
  } finally {
    onAutoSavedProfileReady(profileId, `写法"${profileName}"已自动保存，已经为你打开当前写法编辑。`);
  }
})();
return;
```

This is safer than chaining `.catch(() => onAutoSavedProfileReady(...))` because `finally` avoids duplicating the callback call if both `.then` and `.catch` were naively chained. The async IIFE keeps the `void` fire-and-forget pattern consistent with the original intent while guaranteeing the user notification fires regardless of whether the cache invalidation succeeds or fails.
```

---

### 19. ⚪ Empty catch block that only rethrows — swallows no error but masks intent

- 文件：`server/src/services/novel/director/automation/novelDirectorAutoExecutionRuntime.ts:646-648`
- 类别：swallowed errors (empty catch / catch that hides a needed throw) ｜ 严重度：cosmetic ｜ 修复风险：zero

**问题**：The outer try/catch in `runFromReady` catches `error` and immediately rethrows it with no logging, cleanup, or other side effects. This try/catch is functionally a no-op and was likely left as a placeholder for future error handling, but currently means any intermediate state from failed async operations (like partially-synced task states) cannot be partially cleaned up at this layer.

**为什么是 bug**：A `catch (error) { throw error; }` block is identical in behavior to having no try/catch at all — the error propagates identically. The try block spans the entire auto-execution loop (~500 lines). If the original intent was to add error cleanup (e.g., mark the task as failed on unexpected error), the empty body silently skips that. Any future developer adding handling to this catch block may not realize the method already handles task failure in most code paths before this catch.

**当前代码**：
```ts
} catch (error) {
      throw error;
    }
```

**建议修复**：
```
Remove the outer try/catch entirely. Delete line 109 (`try {`) and lines 646-648 (`} catch (error) { throw error; }`). The body of the try block stays intact. This has zero observable effect since the catch only rethrows.

If the intent is to leave a hook for future cleanup (e.g., a fallback `markTaskFailed` for truly unexpected errors not handled inside the loop), replace with an explicit comment instead of a no-op catch:

```typescript
// Note: most error paths are handled inside the loop (circuit breaker, markTaskFailed, etc.).
// Unexpected errors propagate to the caller as-is.
```

The minimal correct fix is deletion of the `try { ... } catch (error) { throw error; }` wrapper.
```

---

### 20. ⚪ state destructured but unused in book_contract recover function

- 文件：`server/src/services/novel/director/workflowStepRuntime/directorPlanningStepModules.ts:195-202`
- 类别：copy-paste / wrong-variable bugs ｜ 严重度：cosmetic ｜ 修复风险：zero

**问题**：The recover callback for the book_contract step destructures state alongside novelId but never uses it. This is harmless on its own but indicates a copy-paste from a similar recover function that did use state, suggesting a missing step that should reference state (e.g. state.seedPayload for cursor information).

**为什么是 bug**：state is destructured but never referenced. Compare with directorStructuredOutlineStepFactory.ts line 202-207 where state.seedPayload is actually used to derive the recovery cursor. The book_contract recover function may be missing a cursor-based resumeFrom derivation that uses state.

**当前代码**：
```ts
recover: async (context) => {
          const { novelId, state } = await loadDirectorModuleState(context);
          const contract = await getDirectorCoreStepRuntime().getBookContract(novelId);
          if (contract) {
            return { recoverable: true, resumeFrom: "book_contract_artifact", reason: "Book contract artifact already exists." };
          }
          return { recoverable: true, resumeFrom: "book_contract", reason: "Book contract can be regenerated." };
        },
```

**建议修复**：
```
In the `recover` callback at line 196, remove `state` from the destructuring:

```ts
// Before
const { novelId, state } = await loadDirectorModuleState(context);

// After
const { novelId } = await loadDirectorModuleState(context);
```

Do NOT add `state.seedPayload` usage — the book contract step has no cursor-based recovery semantics and no corresponding `getBookContractRecoveryCursor` API exists. The binary recovery logic (contract present → resume from artifact, absent → regenerate) is correct as-is.
```

---

### 21. ⚪ Boolean tautology makes hasDirectorSyncedChapterExecutionContext check dead

- 文件：`server/src/services/novel/director/automation/novelDirectorAutoExecutionScopeRuntime.ts:66-69`
- 类别：inverted boolean / wrong comparison operator ｜ 严重度：cosmetic ｜ 修复风险：low

**问题**：The filter expression `(!hasContract && !hasSynced) || !hasContract` simplifies to `!hasContract` by boolean algebra, making the `hasDirectorSyncedChapterExecutionContext` check entirely inert. Chapters that have no execution context at all (hasSynced=false) but also fail the full contract check (hasContract=false) are included, but chapters that have partial sync (hasSynced=true) and also lack the full contract (hasContract=false) are ALSO included — so the hasSynced check never actually excludes anything. The pre-flight guard in `resolveAutoExecutionRangeAndState` therefore only blocks chapters missing the FULL contract, and does not separately protect against chapters that have no sync context at all when the contract is absent.

**为什么是 bug**：The expression `(A && B) || A` is a tautology equivalent to `A`. The second operand of `&&` (B = `!hasDirectorSyncedChapterExecutionContext`) never has any effect on the result. The original intent (from code context and the separate use of `hasDirectorSyncedChapterExecutionContext` in the readiness check of `directorExecutionStepModules.ts`) was almost certainly `!hasDirectorAutoExecutionChapterContract(chapter) || !hasDirectorSyncedChapterExecutionContext(chapter)`, i.e., flag any chapter missing EITHER the contract OR the sync context. The misplaced `&&` inside the first group collapses the whole expression.

**当前代码**：
```ts
.filter((chapter) => (
  !hasDirectorAutoExecutionChapterContract(chapter)
  && !hasDirectorSyncedChapterExecutionContext(chapter)
) || !hasDirectorAutoExecutionChapterContract(chapter))
```

**建议修复**：
```
Apply the proposed fix as written — it is mechanically safe and equivalent:

```typescript
.filter((chapter) => (
  !hasDirectorAutoExecutionChapterContract(chapter)
  || !hasDirectorSyncedChapterExecutionContext(chapter)
))
```

This eliminates the tautology and makes the intent readable. Since `hasContract=true` implies `hasSynced=true` (the contract check is a strict superset of the sync check), the expression `!hasContract || !hasSynced` evaluates identically to `!hasContract` for all reachable inputs — so no runtime behavior changes. The fix is purely a code-clarity improvement.
```

---

## ⚠️ 驳回 / 需决策（不纳入可安全机械修复，供讨论）

### R1. [真bug-需决策] runTrackedActivity silently clears failed background sync activities instead of marking them as 'failed'
- `server/src/services/novel/runtime/ChapterArtifactBackgroundSyncService.ts:317-331` ｜ isRealBug=True risk=low fixIsSafe=False
- 验证结论：The buggy code at lines 317-331 exists exactly as quoted. `runTrackedActivity` calls `clearBackgroundActivity` in both the success path (line 326) and the catch path (lines 327-329), which removes the activity entry from the pipeline job payload entirely on failure. The `'failed'` status defined in `PipelineBackgroundSyncStatus` ("running" | "failed") is never written anywhere in this file — `updateBackgroundActivity` is only called once, with `'running'`, at line 323. The bug is reachable whene

### R2. [真bug-需决策] recoverableRepairFailure check is dead code — repairDraftContent always returns null
- `server/src/services/novel/runtime/chapterRuntimePipeline.ts:263-268` ｜ isRealBug=True risk=low fixIsSafe=False
- 验证结论：The bug is confirmed real by reading the actual file. The if-block at lines 264-268 checks repairResult.recoverableFailure, but repairDraftContent (lines 435-472) unconditionally returns { content: ..., recoverableFailure: null } at line 470. This means the condition on line 264 is always falsy: deps.markChapterNeedsRepair is never called from this path, and PipelineRuntimeResult.recoverableRepairFailure (returned at line 303) is always null regardless of what happened during repair attempts. Th

### R3. [误报] content is updated to latestResult.finalContent after review but not reset when generating on a second attempt
- `server/src/services/novel/runtime/chapterRuntimePipeline.ts:227` ｜ isRealBug=False risk=zero fixIsSafe=True
- 验证结论：The code at line 227 (`content = latestResult.finalContent;`) exists exactly as quoted. However, the claim itself concludes "NOT a bug on second review" and proposes no fix. This is correct — the flow is intentionally designed.

Tracing the loop in `runPipelineChapterWithRuntime` (lines 158–276):
1. Attempt 0: If `content` is empty, `generateNonEmptyDraftFromWriter` fills it (line 169). Then `finalizeChapterContent` is called (line 211), producing `latestResult`. Line 227 sets `content = latestR

### R4. [误报] persistAcceptanceReports returns a Promise that is not fully typed — raw return without await
- `server/src/services/novel/runtime/ChapterAcceptanceAssessmentService.ts:358-370` ｜ isRealBug=False risk=zero fixIsSafe=True
- 验证结论：The code at lines 305-371 of ChapterAcceptanceAssessmentService.ts exists exactly as quoted. The method `persistAcceptanceReports` is declared `private async ... Promise<AuditReport[]>`. It returns `prisma.auditReport.findMany({...}) as unknown as Promise<AuditReport[]>` without a local `await`. This is not a bug. In an `async` function, returning a Promise (or thenable like a PrismaPromise) without awaiting it causes the async wrapper to forward the inner promise's resolution to the caller — se

### R5. [真bug-需决策] Duplicate union member 'chapter_batch_ready' hides a missing third checkpoint type
- `server/src/services/novel/director/automation/novelDirectorAutoExecutionRuntime.ts:63` ｜ isRealBug=True risk=low fixIsSafe=False
- 验证结论：The duplicate union member `"chapter_batch_ready" | "chapter_batch_ready" | "replan_required"` is confirmed to exist verbatim at line 63 of `novelDirectorAutoExecutionRuntime.ts` and at line 255 of `DirectorCoreStepModuleRuntime.ts`. It is a real copy-paste defect. However, the proposed fix is WRONG and unsafe. The claim that the missing type is `"workflow_completed"` is incorrect. Every caller and sibling type declaration in the codebase uses exactly `"chapter_batch_ready" | "replan_required" |

### R6. [真bug-需决策] Duplicate running-status search in resolveCurrentScopedChapter makes last fallback unreachable
- `server/src/services/novel/director/workflowStepRuntime/directorWorkflowStepShared.ts:129-138` ｜ isRealBug=True risk=medium fixIsSafe=False
- 验证结论：The buggy code exists exactly as quoted at lines 129-138 of directorWorkflowStepShared.ts. Line 132 assigns `active = chapters.find(status === "running") ?? null` with NO additional guard condition — it captures every chapter with status "running". Line 133 returns `active` immediately if non-null. If `active` is null (no running chapters exist in the scoped list), line 136's identical `chapters.find(status === "running")` search must also return undefined/null. Line 136 is provably dead code.



### R7. [误报] buildWindowOrders forward fallback returns non-deduplicated array that may contain gaps
- `server/src/services/planner/replanDecision.ts:195-198` ｜ isRealBug=False risk=zero fixIsSafe=True
- 验证结论：I read the full function at lines 170-235. The buggy code at lines 195-198 exists as quoted. However, there is no reachable bug:

1. NaN guard: Line 177 uses `!anchorChapterOrder`, and `!NaN === true`, so NaN is caught and returns `[]` before reaching the forward fallback loop. No NaN can reach line 195.

2. No deduplication needed: The forward fallback initializes `fallbackOrders = [anchorChapterOrder]` and the loop pushes `anchorChapterOrder + 1`, `anchorChapterOrder + 2`, ... with offset star

### R8. [误报] Array index access `this.taskQueue[index]` without undefined-guard — unsafe under noUncheckedIndexedAccess
- `server/src/services/bookAnalysis/bookAnalysis.queue.ts:86-87` ｜ isRealBug=False risk=zero fixIsSafe=True
- 验证结论：The bug claim is false. I read the actual file at server/src/services/bookAnalysis/bookAnalysis.queue.ts and confirmed:

1. CODE EXISTS AS QUOTED: Lines 85-87 match exactly — `const task = this.taskQueue[index]` followed immediately by `task.analysisId` without an undefined guard.

2. `noUncheckedIndexedAccess` IS NOT ENABLED: I read both tsconfig files. server/tsconfig.json extends ../tsconfig.base.json, which only has `"strict": true`. The `strict` flag bundle in TypeScript does NOT include `n
