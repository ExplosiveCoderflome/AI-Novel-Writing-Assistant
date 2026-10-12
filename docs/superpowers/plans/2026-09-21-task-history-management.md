# Task History Soft Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户可以在“运行记录”和“导演跟进”快速软删除碍眼的终态历史记录，并从“已清理”视图恢复显示。

**Architecture:** 直接复用现有 `TaskCenterArchive` 作为软删除覆盖层，不引入新的生命周期模型或数据库表。新的 `task/archive` 模块统一负责资格判断、批量预览、幂等写入、已清理列表和恢复；两个页面共用同一套服务端事实，因此导演任务在两处同步隐藏和恢复。

**Tech Stack:** TypeScript 5.9、Express 5、Prisma 7、React 19、TanStack Query 5、Node Test Runner、Tailwind CSS

**Spec:** `docs/superpowers/plans/2026-09-21-task-history-management-spec.md`

## Global Constraints

- 实施前从最新 `beta` 创建独立功能分支，不在当前 `codex/fix-issue-159-migration-drift` 分支开发该跨模块功能。
- 软删除只操作 `TaskCenterArchive`，不得修改业务任务状态、检查点、正文、产物、命令、通知或恢复资格。
- `queued`、`running`、`waiting_approval`、人工恢复任务和恢复候选始终不可清理。
- 运行记录继续禁止重试、恢复任务、取消、审批、修复和重规划。
- 不实现物理删除、自动过期、后台定时清理或“错误是否已解决”的自动判断。
- 不新增数据库表；SQLite 与 PostgreSQL 沿用现有 `TaskCenterArchive`。
- UI 使用“清理 / 已清理 / 恢复显示”，并明确这是可见性操作。
- UI 验收由用户完成；实现阶段只运行代码级类型检查和聚焦测试。
- 每个阶段提交前使用 `readme-release-updater` 检查发布说明范围。

---

## File Structure

### New server module

- `server/src/services/task/archive/TaskArchivePolicy.ts`：纯函数判断终态、恢复候选和清理范围。
- `server/src/services/task/archive/TaskArchiveService.ts`：预览、批量软删除、已清理列表和恢复编排。
- `server/src/services/task/archive/index.ts`：模块门面。
- `server/tests/taskArchivePolicy.test.js`：资格与范围测试。
- `server/tests/taskArchiveService.test.js`：幂等、重新校验、恢复和跨页面一致性测试。
- `server/tests/taskArchiveRoutes.test.js`：HTTP 合同测试。

### New client components

- `client/src/pages/tasks/components/TaskArchiveDialog.tsx`：范围选择、预览和确认。
- `client/src/pages/tasks/components/TaskHistoryToolbar.tsx`：当前记录/已清理切换。
- `client/src/pages/tasks/taskArchivePresentation.ts`：纯展示逻辑。
- `client/src/pages/tasks/taskArchivePresentation.test.mjs`：展示逻辑测试。
- `client/src/pages/autoDirectorFollowUps/components/AutoDirectorArchiveDialog.tsx`：导演跟进清理入口。

### Existing files to modify

- `AGENTS.md`、`docs/wiki/product/task-center-role.md`：允许记录软删除，继续禁止工作流动作。
- `shared/types/task.ts`：请求、预览、执行、恢复和已清理元数据合同。
- `server/src/services/task/taskArchive.ts`：保留兼容导出，转发到新模块。
- `server/src/services/task/TaskCenterService.ts`：接入批量软删除与归档列表。
- `server/src/services/task/adapters/*.ts`：允许只读加载已归档记录。
- `server/src/routes/tasks.ts`：新增四个 API 行为。
- `server/src/services/task/autoDirectorFollowUps/AutoDirectorFollowUpService.ts`：支持 active/archived 查询。
- `server/src/routes/autoDirectorFollowUps.ts`：增加可见性参数。
- `client/src/api/tasks.ts`、`client/src/api/autoDirectorFollowUps.ts`：API 封装。
- `client/src/pages/tasks/TaskCenterPage.tsx` 与列表/详情组件：清理、已清理、恢复。
- `client/src/pages/autoDirectorFollowUps/AutoDirectorFollowUpCenterPage.tsx` 与列表组件：清理导演历史。
- `client/tests/taskQueueWorkspaceContracts.test.js`：允许记录管理但继续禁止工作流动作。
- `docs/public/modules/task-center.md`、`docs/public/modules/director-follow-up.md`：用户说明。

---

### Task 1: Update the Rule from “Read-Only” to “No Workflow Actions”

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/wiki/product/task-center-role.md`
- Modify: `docs/public/modules/task-center.md`
- Modify: `docs/public/modules/director-follow-up.md`

**Interfaces:**
- Consumes: 规格中的软删除定义。
- Produces: 后续代码允许 `archive/restore`，但继续禁止任务执行动作的最新仓库规则。

- [ ] **Step 1: Replace the outdated highest-priority wording**

将 Task Center Role Rules 中“归档也禁止”改为：

```markdown
- “运行记录”不是工作流执行面；重试、恢复任务、继续、取消、重规划、修复和审批必须留在来源页面。
- “运行记录”可以软删除和恢复历史记录；软删除只改变列表可见性，不得修改业务任务状态、检查点、正文、产物或恢复资格。
- 活跃任务、等待审批、人工恢复任务和恢复候选不得软删除。
```

- [ ] **Step 2: Update the durable wiki boundary**

在 `docs/wiki/product/task-center-role.md` 写明：

```markdown
“只读”应理解为不执行任务工作流，而不是禁止用户整理历史列表。软删除是 TaskCenterArchive 覆盖层；它不会把失败变成成功，也不会清除恢复位置。
```

- [ ] **Step 3: Update public instructions**

两个公开模块文档统一使用：

```markdown
你可以把不需要继续查看的已结束记录清理到“已清理”。清理不会删除任务结果或正文，也不会改变仍在运行的任务。
```

- [ ] **Step 4: Validate docs**

Run: `pnpm check:docs-manifest`

Expected: PASS。

- [ ] **Step 5: Commit the rule phase**

运行 `readme-release-updater`。本阶段只改变规则和说明、尚未交付入口时，明确跳过发布说明更新。

```bash
git add AGENTS.md docs/wiki/product/task-center-role.md docs/public/modules/task-center.md docs/public/modules/director-follow-up.md
git commit -m "优化：允许安全清理历史运行记录"
```

---

### Task 2: Build the Shared Soft Delete Service and APIs

**Files:**
- Modify: `shared/types/task.ts`
- Create: `server/src/services/task/archive/TaskArchivePolicy.ts`
- Create: `server/src/services/task/archive/TaskArchiveService.ts`
- Create: `server/src/services/task/archive/index.ts`
- Modify: `server/src/services/task/taskArchive.ts`
- Modify: `server/src/services/task/TaskCenterService.ts`
- Modify: `server/src/services/task/adapters/AgentRunTaskAdapter.ts`
- Modify: `server/src/services/task/adapters/BookTaskAdapter.ts`
- Modify: `server/src/services/task/adapters/ImageTaskAdapter.ts`
- Modify: `server/src/services/task/adapters/KnowledgeTaskAdapter.ts`
- Modify: `server/src/services/task/adapters/NovelWorkflowTaskAdapter.ts`
- Modify: `server/src/services/task/adapters/PipelineTaskAdapter.ts`
- Modify: `server/src/services/task/adapters/StyleExtractionTaskAdapter.ts`
- Modify: `server/src/routes/tasks.ts`
- Create: `server/tests/taskArchivePolicy.test.js`
- Create: `server/tests/taskArchiveService.test.js`
- Create: `server/tests/taskArchiveRoutes.test.js`

**Interfaces:**
- Consumes: 现有 `TaskCenterArchive`、`UnifiedTaskSummary` 和恢复候选服务。
- Produces: `TaskArchiveService.preview()`, `archive()`, `restore()`, `listArchived()` 与四个 HTTP 行为。

- [ ] **Step 1: Write failing policy tests**

创建 `server/tests/taskArchivePolicy.test.js`：

```js
test("errors scope accepts failed and cancelled terminal records", () => {
  assert.equal(policy.evaluate(failedTask(), "errors").eligible, true);
  assert.equal(policy.evaluate(cancelledTask(), "errors").eligible, true);
  assert.equal(policy.evaluate(succeededTask(), "errors").eligible, false);
});

test("terminal scope rejects active and recoverable tasks", () => {
  assert.equal(policy.evaluate(runningTask(), "terminal").reason, "active_task");
  assert.equal(policy.evaluate(failedTask({ pendingManualRecovery: true }), "terminal").reason, "recovery_required");
});
```

- [ ] **Step 2: Run policy tests and confirm failure**

Run: `pnpm --filter @ai-novel/server build && node --test server/tests/taskArchivePolicy.test.js`

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Add exact shared contracts**

在 `shared/types/task.ts` 增加：

```ts
export type TaskHistoryVisibility = "active" | "archived";
export type TaskArchiveScope = "errors" | "completed" | "terminal" | "selected";

export interface TaskArchiveEntryRef {
  kind: TaskKind;
  id: string;
}

export interface TaskArchiveRequest {
  scope: TaskArchiveScope;
  entries?: TaskArchiveEntryRef[];
  kind?: TaskKind;
  source: "task_center" | "director_follow_up";
  requestKey: string;
}

export type TaskArchiveSkipReason =
  | "active_task"
  | "waiting_approval"
  | "recovery_required"
  | "scope_mismatch"
  | "not_found"
  | "state_changed";

export interface TaskArchivePreviewItem {
  entry: TaskArchiveEntryRef;
  title: string;
  status: TaskStatus;
  ownerLabel: string;
}

export interface TaskArchivePreview {
  candidateCount: number;
  candidates: TaskArchivePreviewItem[];
  skippedCount: number;
  skipped: Array<{ entry: TaskArchiveEntryRef; reason: TaskArchiveSkipReason }>;
  truncated: boolean;
}

export interface TaskArchiveResult extends TaskArchivePreview {
  archivedCount: number;
  alreadyArchivedCount: number;
}

export interface TaskArchiveRestoreResult {
  entry: TaskArchiveEntryRef;
  restored: boolean;
  reason?: "not_archived" | "legacy_not_restorable";
}

export interface TaskArchiveMetadata {
  archivedAt: string;
  restoreAvailable: boolean;
}
```

在 `UnifiedTaskSummary` 增加 `archive?: TaskArchiveMetadata | null`。

`candidates` 和 `skipped` 各自最多返回 50 条预览样本；`candidateCount/skippedCount` 是完整计数。单次执行最多软删除 500 条，`truncated=true` 表示执行后仍可能有更多记录。

- [ ] **Step 4: Implement the pure eligibility policy**

`TaskArchivePolicy.evaluate()` 必须先应用安全拒绝，再应用范围：

```ts
if (task.status === "queued" || task.status === "running") return blocked("active_task");
if (task.status === "waiting_approval") return blocked("waiting_approval");
if (task.pendingManualRecovery || isRecoveryCandidate) return blocked("recovery_required");

if (scope === "errors" && task.status !== "failed" && task.status !== "cancelled") {
  return blocked("scope_mismatch");
}
if (scope === "completed" && task.status !== "succeeded") return blocked("scope_mismatch");
if (scope === "terminal" && !TERMINAL_STATUSES.has(task.status)) return blocked("scope_mismatch");
if (scope === "selected" && !TERMINAL_STATUSES.has(task.status)) return blocked("scope_mismatch");
return allowed();
```

- [ ] **Step 5: Write failing service and route tests**

`server/tests/taskArchiveService.test.js` 和 `server/tests/taskArchiveRoutes.test.js` 必须验证：

```js
test("batch archive is idempotent", async () => {
  const first = await service.archive(request);
  const second = await service.archive(request);
  assert.equal(first.archivedCount, 2);
  assert.equal(second.alreadyArchivedCount, 2);
});

test("execution revalidates state after preview", async () => {
  task.status = "running";
  const result = await service.archive(request);
  assert.equal(result.archivedCount, 0);
  assert.equal(result.skipped[0].reason, "state_changed");
});
```

路由合同：

```text
GET  /tasks?visibility=archived
POST /tasks/archive/preview
POST /tasks/archive/batch
POST /tasks/archive/restore
```

- [ ] **Step 6: Add adapter read options for archived listing**

所有适配器的 `list/detail` 读方法接受：

```ts
interface TaskAdapterReadOptions {
  includeArchived?: boolean;
}
```

默认行为保持排除归档；`listArchived()` 先读取 `TaskCenterArchive`，再用 `detail(id, { includeArchived: true })` 组装记录，并附上 `archive.archivedAt`。

- [ ] **Step 7: Implement preview, archive, restore, and listing**

服务端行为：

```ts
async preview(input: TaskArchiveRequest): Promise<TaskArchivePreview>;
async archive(input: TaskArchiveRequest): Promise<TaskArchiveResult>;
async restore(entry: TaskArchiveEntryRef): Promise<TaskArchiveRestoreResult>;
async listArchived(input: { kind?: TaskKind; limit: number }): Promise<UnifiedTaskSummary[]>;
```

`source === "director_follow_up"` 时忽略客户端 `kind` 并强制使用 `novel_workflow`。执行阶段重新加载任务和恢复候选，再运行资格策略。批量写入继续使用 `TaskCenterArchive.upsert()`。

范围请求必须直接扫描各任务适配器的历史终态数据，不能复用前端列表的 80 条上限。候选按 `updatedAt asc` 排序，单次取前 500 条；这样一次清理优先移走最旧记录，仍有更多时允许用户再次执行。

- [ ] **Step 8: Preserve old single-item archive compatibility**

现有 `POST /tasks/:kind/:id/archive` 转发到：

```ts
taskArchiveService.archive({
  scope: "selected",
  entries: [{ kind, id }],
  source: "task_center",
  requestKey: `legacy-single:${kind}:${id}`,
});
```

保持旧响应合同，避免已有调用中断。

- [ ] **Step 9: Separate book-result archive from run-record cleanup**

删除 `BookTaskAdapter.archive()` 中对 `bookAnalysisService.updateAnalysisStatus(id, "archived")` 的调用。新清理只写 `TaskCenterArchive`。历史上已经是 `BookAnalysis.status="archived"` 的记录保持拆书模块所有，不尝试恢复原状态。

- [ ] **Step 10: Run server verification**

Run: `pnpm --filter @ai-novel/shared build && pnpm --filter @ai-novel/server build && node --test server/tests/taskArchivePolicy.test.js server/tests/taskArchiveService.test.js server/tests/taskArchiveRoutes.test.js server/tests/taskRecoveryRoutes.test.js server/tests/bookAnalysis.test.js`

Expected: PASS。

- [ ] **Step 11: Commit the service phase**

运行 `readme-release-updater`。本阶段尚未形成页面入口，可明确跳过发布说明。

```bash
git add shared/types/task.ts server/src/services/task/archive server/src/services/task/taskArchive.ts server/src/services/task/TaskCenterService.ts server/src/services/task/adapters server/src/routes/tasks.ts server/tests/taskArchive*.test.js
git commit -m "新增：提供历史记录批量软删除与恢复"
```

---

### Task 3: Add Cleanup and Restore to Run Records

**Files:**
- Modify: `client/src/api/tasks.ts`
- Modify: `client/src/pages/tasks/TaskCenterPage.tsx`
- Modify: `client/src/pages/tasks/components/TaskCenterListPanel.tsx`
- Modify: `client/src/pages/tasks/components/TaskCenterDetailPanel.tsx`
- Create: `client/src/pages/tasks/components/TaskArchiveDialog.tsx`
- Create: `client/src/pages/tasks/components/TaskHistoryToolbar.tsx`
- Create: `client/src/pages/tasks/taskArchivePresentation.ts`
- Create: `client/src/pages/tasks/taskArchivePresentation.test.mjs`
- Modify: `client/tests/taskQueueWorkspaceContracts.test.js`

**Interfaces:**
- Consumes: Task 2 的四个 API 和共享类型。
- Produces: 当前/已清理视图、三种快速清理范围、单条清理、恢复显示。

- [ ] **Step 1: Write failing presentation tests**

```js
test("cleanup consequence says records are only hidden", () => {
  assert.equal(
    buildCleanupConsequence(18),
    "将 18 条记录移到已清理。不会删除任务结果、正文或恢复位置。",
  );
});

test("recoverable tasks show a disabled cleanup reason", () => {
  assert.equal(getCleanupState(recoverableTask).disabledReason, "等待恢复的记录不能清理");
});
```

- [ ] **Step 2: Run the client test and confirm failure**

Run: `pnpm --filter @ai-novel/client test`

Expected: FAIL because the new presentation module does not exist.

- [ ] **Step 3: Add typed API functions**

```ts
export function previewTaskArchive(input: TaskArchiveRequest) {
  return apiClient.post<ApiResponse<TaskArchivePreview>>("/tasks/archive/preview", input);
}

export function batchArchiveTasks(input: TaskArchiveRequest) {
  return apiClient.post<ApiResponse<TaskArchiveResult>>("/tasks/archive/batch", input);
}

export function restoreTaskArchive(entry: TaskArchiveEntryRef) {
  return apiClient.post<ApiResponse<TaskArchiveRestoreResult>>("/tasks/archive/restore", entry);
}
```

- [ ] **Step 4: Add “当前记录 / 已清理” toolbar**

默认 `active`。切换 `archived` 后列表请求携带 `visibility=archived`，隐藏异常筛选和恢复候选摘要，避免把已清理内容再次当成当前问题。

- [ ] **Step 5: Add the cleanup dialog**

对话框范围：

```ts
[
  { value: "errors", label: "清理历史错误" },
  { value: "completed", label: "清理已完成记录" },
  { value: "terminal", label: "清理所有已结束记录" },
]
```

切换范围立即请求预览；显示候选数、跳过数和原因。确认按钮为 `清理 ${candidateCount} 条记录`，并显示“不会删除任务结果、正文或恢复位置”。

当 `truncated=true` 时增加“本次最多清理 500 条，完成后仍可继续清理”的提示。

- [ ] **Step 6: Add single-item cleanup and restore**

详情面板仅在终态且非恢复候选时显示“清理这条”。已清理视图显示“恢复显示”。两者都只调用记录管理 API，不加入重试或恢复任务动作。

- [ ] **Step 7: Invalidate all affected projections**

成功后执行：

```ts
await Promise.all([
  queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all }),
  queryClient.invalidateQueries({ queryKey: queryKeys.autoDirectorFollowUps.all }),
  queryClient.invalidateQueries({ queryKey: queryKeys.home.all }),
]);
```

- [ ] **Step 8: Update the workspace contract test**

将禁止规则从包含 `archiveTask` 的正则改为只禁止工作流动作：

```js
assert.doesNotMatch(taskPage, /retryTask|continueNovelWorkflow|cancelTask|resumeRecoveryCandidate/);
assert.match(taskPage, /TaskHistoryToolbar/);
assert.match(taskPage, /TaskArchiveDialog/);
```

- [ ] **Step 9: Run client verification**

Run: `pnpm --filter @ai-novel/client typecheck && pnpm --filter @ai-novel/client test`

Expected: PASS。不运行浏览器或截图验收。

- [ ] **Step 10: Commit run-record cleanup**

运行 `readme-release-updater`，首次记录用户可见结果。

```bash
git add client/src/api/tasks.ts client/src/pages/tasks client/tests/taskQueueWorkspaceContracts.test.js docs/releases/release-notes.md README.md
git commit -m "新增：运行记录支持快速清理与恢复显示"
```

---

### Task 4: Add the Same Soft Delete Flow to Director Follow-up

**Files:**
- Modify: `shared/types/autoDirectorFollowUp.ts`
- Modify: `server/src/services/task/autoDirectorFollowUps/AutoDirectorFollowUpService.ts`
- Modify: `server/src/routes/autoDirectorFollowUps.ts`
- Modify: `server/tests/autoDirectorFollowUpService.test.js`
- Modify: `client/src/api/autoDirectorFollowUps.ts`
- Modify: `client/src/pages/autoDirectorFollowUps/AutoDirectorFollowUpCenterPage.tsx`
- Modify: `client/src/pages/autoDirectorFollowUps/components/AutoDirectorFollowUpList.tsx`
- Create: `client/src/pages/autoDirectorFollowUps/components/AutoDirectorArchiveDialog.tsx`
- Modify: `client/src/pages/autoDirectorFollowUps/followUpPresentation.test.mjs`

**Interfaces:**
- Consumes: Task 2 的共享软删除服务与 Task 3 的交互文案。
- Produces: 当前跟进/已清理切换、导演历史批量清理和恢复。

- [ ] **Step 1: Write failing service tests**

```js
test("active follow-up excludes archived workflow tasks", async () => {
  const result = await service.list({ visibility: "active" });
  assert.equal(result.items.some((item) => item.directorTaskId === "archived-task"), false);
});

test("archived follow-up returns archived workflow tasks only", async () => {
  const result = await service.list({ visibility: "archived" });
  assert.deepEqual(result.items.map((item) => item.directorTaskId), ["archived-task"]);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm --filter @ai-novel/server build && node --test server/tests/autoDirectorFollowUpService.test.js`

Expected: FAIL because follow-up visibility does not support archived rows.

- [ ] **Step 3: Add follow-up visibility**

`AutoDirectorFollowUpListInput` 增加：

```ts
visibility?: "active" | "archived";
```

`active` 保持当前排除归档行为；`archived` 读取 `TaskCenterArchive` 中 `taskKind="novel_workflow"` 的标识，并只投影对应导演任务。概览默认只统计 active。

- [ ] **Step 4: Add the director cleanup dialog**

复用相同三种范围，但请求固定：

```ts
{
  scope,
  kind: "novel_workflow",
  source: "director_follow_up",
  requestKey: buildIdempotencyKey("director-follow-up-cleanup"),
}
```

服务端再次强制 `novel_workflow`，不能信任客户端 `kind`。

- [ ] **Step 5: Keep auto-approval records out of cleanup**

`itemType === "auto_approval_record"` 不生成清理入口、不进入候选、不出现在已清理任务列表。它仍按现有近期审计逻辑展示。

- [ ] **Step 6: Separate batch workflow actions from cleanup**

现有“批量继续 / 批量重试”保持原位，只作用于当前选择。清理入口使用独立对话框；进入 `archived` 视图时清空 `selectedDirectorTaskIds`，避免把清理理解成任务动作。

- [ ] **Step 7: Add restore and shared cache invalidation**

恢复导演任务后同时刷新 tasks、autoDirectorFollowUps 和 home 查询，保证两处列表与侧栏数量同步。

- [ ] **Step 8: Run follow-up verification**

Run: `pnpm --filter @ai-novel/shared build && pnpm --filter @ai-novel/server build && node --test server/tests/autoDirectorFollowUpService.test.js server/tests/taskArchiveService.test.js`

Run: `pnpm --filter @ai-novel/client typecheck && pnpm --filter @ai-novel/client test`

Expected: PASS。

- [ ] **Step 9: Commit director cleanup**

运行 `readme-release-updater`，把两个页面的清理能力合并到同日说明。

```bash
git add shared/types/autoDirectorFollowUp.ts server/src/services/task/autoDirectorFollowUps server/src/routes/autoDirectorFollowUps.ts server/tests/autoDirectorFollowUpService.test.js client/src/api/autoDirectorFollowUps.ts client/src/pages/autoDirectorFollowUps docs/releases/release-notes.md README.md
git commit -m "新增：导演跟进支持快速清理历史记录"
```

---

### Task 5: Final Verification and Beta Handoff

**Files:**
- Modify if needed: `docs/wiki/product/task-center-role.md`
- Modify if needed: `docs/public/modules/task-center.md`
- Modify if needed: `docs/public/modules/director-follow-up.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Tasks 1-4 completed behavior。
- Produces: 可合并到 `beta` 进行用户 UI 验收的功能分支。

- [ ] **Step 1: Verify the durable rules match the implementation**

文档必须明确：

```markdown
- 清理是可恢复软删除，只改变列表可见性。
- 活跃、审批和恢复任务不可清理。
- 运行记录仍不执行重试、恢复任务、取消、修复或重规划。
- 导演任务在运行记录和导演跟进共用同一个清理标记。
```

- [ ] **Step 2: Run the complete targeted check set**

Run: `pnpm --filter @ai-novel/shared build`

Run: `pnpm --filter @ai-novel/server typecheck`

Run: `node --test server/tests/taskArchivePolicy.test.js server/tests/taskArchiveService.test.js server/tests/taskArchiveRoutes.test.js server/tests/autoDirectorFollowUpService.test.js server/tests/taskRecoveryRoutes.test.js server/tests/bookAnalysis.test.js`

Run: `pnpm --filter @ai-novel/client typecheck`

Run: `pnpm --filter @ai-novel/client test`

Expected: all PASS。已在最后文件修改后运行的同范围检查可按 Verification Reuse Rules 复用。

- [ ] **Step 3: Verify no destructive implementation slipped in**

Run: `rg -n "deleteMany|TRUNCATE|DROP TABLE" server/src/services/task/archive server/src/routes/tasks.ts`

Expected: no matches。

Run: `rg -n "taskCenterArchive\.delete" server/src/services/task/archive`

Expected: 仅恢复单条归档标记的 `delete`，没有业务表删除。

- [ ] **Step 4: Verify task-center workflow actions remain absent**

Run: `rg -n "retryTask|cancelTask|resumeRecoveryCandidate|continueNovelWorkflow" client/src/pages/tasks`

Expected: no matches。

- [ ] **Step 5: Finalize release surfaces**

运行 `readme-release-updater`，检查完整未发布范围；发布说明描述“可快速清理并恢复历史记录”，不得写成永久删除或错误已自动解决。

- [ ] **Step 6: Commit the final documentation phase**

```bash
git add docs/wiki docs/public docs/releases/release-notes.md README.md
git commit -m "优化：补齐历史记录清理说明与验证"
```

- [ ] **Step 7: Merge to beta for UI acceptance**

将功能分支合并到 `beta`，由用户验证两个页面的按钮位置、预览数量、清理后列表变化和恢复显示。通过后再按 `beta -> main` 发布流程推进。

---

## Self-Review

- Spec coverage: 快速清理、软删除、恢复、两个页面同步、不可清理状态、拆书状态分离和双数据库兼容均有任务覆盖。
- Scope control: 删除了自动判断旧错误是否失效、`resolved` 生命周期、数据库字段扩展和保留期限策略。
- Type consistency: `TaskArchiveScope`、`TaskArchiveRequest`、`TaskArchivePreview`、`TaskArchiveResult`、`TaskArchiveRestoreResult` 在服务端与客户端保持同名。
- Safety: 业务表不删除；只有恢复显示会删除一条 `TaskCenterArchive` 覆盖标记。
- Architecture: 新能力进入 `services/task/archive/`，没有继续扩大高密度根目录，也没有新增泛化工具文件。
