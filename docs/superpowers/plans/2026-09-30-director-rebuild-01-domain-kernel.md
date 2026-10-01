# 自动导演重构 · 计划 01：领域内核落地（P0 修订版）

> **给执行者：** 本计划的代码和测试**已经开发完成，并在验证环境中 49/49 通过**。你的任务不是设计或改写，而是把下面给出的文件**逐字**放进仓库、编译、运行测试、提交。按 Task 顺序执行，用复选框记录进度。遇到"停止条件"立即停止并报告。

**目标：** 在 `server/src/modules/director/domain/` 落地不依赖数据库的领域内核：步骤计划依赖图、运行控制状态机、守卫、计划编排器、展示投影。

**架构：** 纯函数、无 I/O。编排器只读事实并给出下一个动作；守卫集中所有安全校验；控制态只能经一张迁移表变化；展示由一个纯函数生成。详见设计文档。

**技术栈：** TypeScript（`strict`）、Node 内置测试 `node:test`、测试读取 `server/dist` 编译产物。

**设计文档：** `docs/superpowers/specs/2026-09-30-director-rebuild-design.md`（第 4、5、7 节）

**分支与目录：** 分支 `refactor/director-rebuild`，工作目录 `D:\code\ai-director-rebuild`。所有命令在该目录下执行。

## P0 修订覆盖（2026-10-01，执行时以此为准）

1. **范围隔离必须进入领域函数签名。** `ArtifactRef.scope` 与 `RunContract.scope` 均为必填；`latestArtifact`、`isArtifactSatisfied`、`readySteps`、`remainingSteps`、展示进度和守卫必须按 scope 过滤。不得用另一本书、另一卷或另一章的同类型最高版本解锁当前步骤。新增回归用例：同类型跨 scope 时不能满足依赖。
2. **Run 合同冻结启动事实。** `RunContract` 增加 `chapterRange`、`issuePolicy`（含 `completion_first | quality_first` 与版本）和 `modelConfig`（路由、模型、版本），创建后视为只读。质量优先策略的 `pause_for_manual` 必须以 `StopSignal.kind = manual_recovery` 在已保存边界暂停；完成优先下局部质量债不得制造 stop signal。
3. **停止动作必须有结构化依据。** `checkAction` 不得无条件接受 `pause` / `fail`。`pause(replan|safety)` 必须匹配 `FactsSnapshot.stopSignal`，`pause(manual_recovery)` 只能匹配质量优先人工暂停或结构化的 `no_runnable_step` 安全边界；`fail` 必须有安全、完整性或无可用正文信号。新增任意 `pause(replan)` 被拒绝的回归用例。
4. **章节质量与重试边界。** `record_debt` 必须落在 `chapterRange` 内；质量债只记录不改变运行状态。每章自动修复预算由下游章节 runtime 持有，本领域内核不得新增第二份重试计数或把局部债务转成全局失败。
5. **失效保护。** `chapter_draft` 永不因规划产物重算而被覆盖、清空或作为可覆盖目标；用户编辑产物触发的是 requires 依赖闭包，保留 scope，跳过受保护正文。领域测试增加传递下游、用户保护和正文排除用例。
6. **模块边界与提交。** 仍只允许本文列出的 `server/src/modules/director/domain/*`、`server/tests/directorNext/*` 文件；不导入旧导演代码、数据库、时钟或随机数。每个 Task 单独提交，内部文档不更新发布说明。

## Global Constraints

- 新内核位于 `server/src/modules/director/`，**只 import 模块内部文件**，不得 import 旧导演代码、`prisma`、`db`、任何包或路径别名。（由 Task 6 的边界测试强制）
- `domain/` 内不得出现 `Date.now()`、`new Date(`、`Math.random()`、`process.env`。（边界测试强制）
- **不得修改**列表之外的任何文件；尤其不得修改 `server/src/services/novel/director/`、`shared/`、`client/`、`server/src/prisma/`、`server/scripts/run-tests.cjs`。
- 不得新增依赖；不得使用 `any`、`@ts-ignore`、`@ts-expect-error`。
- 原型代码片段是基线；与上方 **P0 修订覆盖** 冲突的类型、函数签名、守卫和测试必须按修订覆盖实施。未冲突的中文文案与断言保持原样。
- 测试就是完成标准：不得修改、跳过、放宽任何断言。
- 每个 Task 一次提交；提交信息以 `优化：` 开头；只 `git add` 该 Task 列出的文件。
- 本计划是纯内部改动，**不更新发布说明和 README**。

## 停止条件（立即停止并写报告，不要绕过）

| 编号 | 情况 |
| --- | --- |
| S1 | 需要修改"本计划列出的文件"之外的文件 |
| S2 | 需要改动测试断言才能让测试通过 |
| S3 | `pnpm --filter @ai-novel/server build` 因**与本计划无关**的文件报错 |
| S4 | 测试数量或通过数与 Task 中写明的期望不一致，且无法在本 Task 范围内解释 |
| S5 | 想使用 `any`、`@ts-ignore` 或新增依赖 |

## 文件总览

| 路径 | 职责 |
| --- | --- |
| `server/src/modules/director/domain/types.ts` | 全部领域类型 |
| `server/src/modules/director/domain/plan.ts` | 计划校验、就绪步骤、下游失效计算 |
| `server/src/modules/director/domain/control.ts` | 运行控制状态机与迁移表 |
| `server/src/modules/director/domain/guard.ts` | 动作守卫 |
| `server/src/modules/director/domain/planOrchestrator.ts` | 全自动计划编排器 |
| `server/src/modules/director/domain/projection.ts` | 展示投影纯函数 |
| `server/src/modules/director/domain/index.ts` | 领域层出口（随 Task 逐步增长） |
| `server/tests/directorNext/fixtures.js` | 测试夹具（不是测试文件） |
| `server/tests/directorNext/{plan,control,guard,planOrchestrator,projection,boundary}.test.js` | 六个测试文件，合计 49 个用例 |

`run-tests.cjs` 会递归收集 `server/tests` 下所有 `.test.js`，无需登记。`fixtures.js` 不以 `.test.js` 结尾，不会被当成测试。

---

### Task 0：准备环境

- [ ] **Step 1：确认位置与分支**

```powershell
Set-Location D:\code\ai-director-rebuild
git branch --show-current
git status --short
```

预期：分支为 `refactor/director-rebuild`，`git status` 无输出。若不一致，停止。

- [ ] **Step 2：安装依赖并编译共享包**

这个 worktree 是新建的，没有 `node_modules`。

```powershell
pnpm install
pnpm --filter @ai-novel/shared build
pnpm --filter @ai-novel/server prisma:generate
```

预期：三条命令都成功。第三条只生成本地 Prisma 客户端类型，让服务端编译不因其他文件缺少类型而报错；它不连接、不修改任何数据库。若 `prisma:generate` 失败，按停止条件 S3 处理并报告，不要自行改配置。

- [ ] **Step 3：确认服务端基线可编译**

```powershell
pnpm --filter @ai-novel/server build
```

预期：成功，无错误。若失败且错误与本计划无关，触发 S3，停止。

---

### Task 1：类型与计划模块（11 个用例）

**Files:**
- Create: `server/src/modules/director/domain/types.ts`
- Create: `server/src/modules/director/domain/plan.ts`
- Create: `server/src/modules/director/domain/index.ts`
- Create: `server/tests/directorNext/fixtures.js`
- Create: `server/tests/directorNext/plan.test.js`

**Interfaces:**
- Produces（后续 Task 依赖）：`ArtifactRef`、`StepDefinition`、`PlanDefinition`、`RunContract`、`RunControl`、`FactsSnapshot`、`Action`、`Orchestrator` 等类型；`definePlan`、`readySteps`、`remainingSteps`、`latestArtifact`、`isArtifactSatisfied`、`downstreamArtifactTypes`、`PlanValidationError`。

- [ ] **Step 1：创建 `server/src/modules/director/domain/types.ts`**

```ts
export type ArtifactType = string;

export type ArtifactStatus = "draft" | "confirmed" | "user_edited" | "stale";

export interface ArtifactRef {
  type: ArtifactType;
  scope: string;
  version: number;
  status: ArtifactStatus;
  protectedUserContent: boolean;
}

export interface QualityDebtRef {
  chapterOrder: number;
  code: string;
}

export interface StepDefinition {
  id: string;
  label: string;
  requires: readonly ArtifactType[];
  produces: ArtifactType;
  needs: readonly string[];
  gateable: boolean;
  overwrites: readonly ArtifactType[];
}

export interface PlanDefinition {
  version: string;
  externalArtifacts: readonly ArtifactType[];
  steps: readonly StepDefinition[];
}

export type Driver = "auto" | "assisted";

export interface RunContract {
  runId: string;
  novelId: string;
  driver: Driver;
  planVersion: string;
  stepIdsInScope: readonly string[] | null;
  tokenBudget: number | null;
  rejectionBudget: number;
}

export type RunStatus =
  | "queued"
  | "running"
  | "waiting_gate"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type PauseKind = "manual_recovery" | "replan" | "safety";

export interface RunPause {
  kind: PauseKind;
  reason: string;
}

export interface RunGate {
  id: string;
  artifactTypes: readonly ArtifactType[];
}

export interface RunControl {
  version: number;
  status: RunStatus;
  pause: RunPause | null;
  gate: RunGate | null;
  cursorStepId: string | null;
  failureReason: string | null;
}

export type StopSignalKind = "replan" | "safety" | "data_integrity" | "no_usable_content";

export interface StopSignal {
  kind: StopSignalKind;
  reason: string;
}

export interface FactsSnapshot {
  artifacts: readonly ArtifactRef[];
  debts: readonly QualityDebtRef[];
  stopSignal: StopSignal | null;
}

export type Action =
  | { kind: "run_step"; stepId: string }
  | { kind: "open_gate"; gateId: string; artifactTypes: readonly ArtifactType[] }
  | { kind: "record_debt"; chapterOrder: number; code: string }
  | { kind: "pause"; pause: RunPause }
  | { kind: "complete" }
  | { kind: "fail"; reason: string };

export interface OrchestratorInput {
  plan: PlanDefinition;
  contract: RunContract;
  facts: FactsSnapshot;
}

export interface Orchestrator {
  next(input: OrchestratorInput): Action;
}
```

- [ ] **Step 2：创建 `server/src/modules/director/domain/plan.ts`**

```ts
import type {
  ArtifactRef,
  ArtifactType,
  FactsSnapshot,
  PlanDefinition,
  StepDefinition,
} from "./types";

export class PlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanValidationError";
  }
}

export function definePlan(input: PlanDefinition): PlanDefinition {
  const stepIds = new Set<string>();
  const producers = new Map<ArtifactType, string>();
  for (const step of input.steps) {
    if (stepIds.has(step.id)) {
      throw new PlanValidationError(`duplicate step id: ${step.id}`);
    }
    stepIds.add(step.id);
    const existing = producers.get(step.produces);
    if (existing) {
      throw new PlanValidationError(
        `artifact type ${step.produces} is produced by both ${existing} and ${step.id}`,
      );
    }
    producers.set(step.produces, step.id);
  }

  const external = new Set(input.externalArtifacts);
  const isKnownType = (type: ArtifactType) => producers.has(type) || external.has(type);
  for (const step of input.steps) {
    for (const type of step.requires) {
      if (!isKnownType(type)) {
        throw new PlanValidationError(`step ${step.id} requires unknown artifact type ${type}`);
      }
    }
    for (const type of step.overwrites) {
      if (!isKnownType(type)) {
        throw new PlanValidationError(`step ${step.id} overwrites unknown artifact type ${type}`);
      }
    }
  }

  const stepById = new Map(input.steps.map((step) => [step.id, step]));
  const visitState = new Map<string, "visiting" | "done">();
  const visit = (step: StepDefinition): void => {
    const state = visitState.get(step.id);
    if (state === "done") {
      return;
    }
    if (state === "visiting") {
      throw new PlanValidationError(`dependency cycle detected at step ${step.id}`);
    }
    visitState.set(step.id, "visiting");
    for (const type of step.requires) {
      const producerId = producers.get(type);
      const producer = producerId ? stepById.get(producerId) : undefined;
      if (producer) {
        visit(producer);
      }
    }
    visitState.set(step.id, "done");
  };
  for (const step of input.steps) {
    visit(step);
  }

  return Object.freeze({
    version: input.version,
    externalArtifacts: Object.freeze([...input.externalArtifacts]),
    steps: Object.freeze(input.steps.map((step) => Object.freeze({ ...step }))),
  });
}

/**
 * 某个产物类型发生变化（用户编辑、重新生成）后，按 requires 边传递依赖它的全部下游产物类型。
 * 不包含自身；只包含计划内的产物类型，因此不在计划里的内容（例如章节正文）永远不会被它标记为失效。
 * 结果按计划步骤顺序排列。
 */
export function downstreamArtifactTypes(
  plan: PlanDefinition,
  changedType: ArtifactType,
): ArtifactType[] {
  const affected = new Set<ArtifactType>();
  const queue: ArtifactType[] = [changedType];
  while (queue.length > 0) {
    const current = queue.shift() as ArtifactType;
    for (const step of plan.steps) {
      if (step.requires.includes(current) && !affected.has(step.produces)) {
        affected.add(step.produces);
        queue.push(step.produces);
      }
    }
  }
  affected.delete(changedType);
  return plan.steps.map((step) => step.produces).filter((type) => affected.has(type));
}

export function latestArtifact(
  facts: FactsSnapshot,
  type: ArtifactType,
): ArtifactRef | undefined {
  let latest: ArtifactRef | undefined;
  for (const artifact of facts.artifacts) {
    if (artifact.type === type && (!latest || artifact.version > latest.version)) {
      latest = artifact;
    }
  }
  return latest;
}

export function isArtifactSatisfied(
  facts: FactsSnapshot,
  type: ArtifactType,
  requireConfirmed: boolean,
): boolean {
  const artifact = latestArtifact(facts, type);
  if (!artifact || artifact.status === "stale") {
    return false;
  }
  if (requireConfirmed) {
    return artifact.status === "confirmed" || artifact.status === "user_edited";
  }
  return true;
}

function stepsInScope(
  plan: PlanDefinition,
  stepIdsInScope: readonly string[] | null | undefined,
): StepDefinition[] {
  if (!stepIdsInScope) {
    return [...plan.steps];
  }
  const allowed = new Set(stepIdsInScope);
  return plan.steps.filter((step) => allowed.has(step.id));
}

export interface ReadyStepsOptions {
  requireConfirmed: boolean;
  stepIdsInScope?: readonly string[] | null;
}

export function remainingSteps(
  plan: PlanDefinition,
  facts: FactsSnapshot,
  stepIdsInScope?: readonly string[] | null,
): StepDefinition[] {
  return stepsInScope(plan, stepIdsInScope).filter(
    (step) => !isArtifactSatisfied(facts, step.produces, false),
  );
}

export function readySteps(
  plan: PlanDefinition,
  facts: FactsSnapshot,
  options: ReadyStepsOptions,
): StepDefinition[] {
  return remainingSteps(plan, facts, options.stepIdsInScope).filter((step) =>
    step.requires.every((type) => isArtifactSatisfied(facts, type, options.requireConfirmed)),
  );
}
```

- [ ] **Step 3：创建 `server/src/modules/director/domain/index.ts`（本 Task 的版本）**

```ts
export * from "./types";
export * from "./plan";
```

- [ ] **Step 4：创建 `server/tests/directorNext/fixtures.js`**

```js
const domain = require("../../dist/modules/director/domain/index.js");

const plan = domain.definePlan({
  version: "test-plan-1",
  externalArtifacts: ["novel_seed"],
  steps: [
    {
      id: "story_macro",
      label: "故事宏观规划",
      requires: ["novel_seed"],
      produces: "story_macro",
      needs: ["structured_output"],
      gateable: true,
      overwrites: [],
    },
    {
      id: "character_cast",
      label: "角色阵容",
      requires: ["story_macro"],
      produces: "character_cast",
      needs: ["structured_output"],
      gateable: true,
      overwrites: [],
    },
    {
      id: "volume_strategy",
      label: "卷战略",
      requires: ["story_macro", "character_cast"],
      produces: "volume_strategy",
      needs: [],
      gateable: true,
      overwrites: [],
    },
    {
      id: "chapter_list",
      label: "章节列表",
      requires: ["volume_strategy"],
      produces: "chapter_list",
      needs: [],
      gateable: true,
      overwrites: [],
    },
  ],
});

const artifactTypes = {
  story_macro: { label: "故事宏观规划", reviewRoute: "/novels/n1/edit?stage=story_macro" },
  character_cast: { label: "角色阵容", reviewRoute: "/novels/n1/edit?stage=character" },
  volume_strategy: { label: "卷战略", reviewRoute: "/novels/n1/edit?stage=outline" },
  chapter_list: { label: "章节列表", reviewRoute: "/novels/n1/edit?stage=outline" },
};

function artifact(type, overrides = {}) {
  return {
    type,
    scope: "book",
    version: 1,
    status: "draft",
    protectedUserContent: false,
    ...overrides,
  };
}

function facts(artifacts = [], extra = {}) {
  return { artifacts, debts: [], stopSignal: null, ...extra };
}

function contract(overrides = {}) {
  return {
    runId: "run-1",
    novelId: "novel-1",
    driver: "auto",
    planVersion: "test-plan-1",
    stepIdsInScope: null,
    tokenBudget: null,
    rejectionBudget: 3,
    ...overrides,
  };
}

function runningControl(overrides = {}) {
  return {
    version: 1,
    status: "running",
    pause: null,
    gate: null,
    cursorStepId: null,
    failureReason: null,
    ...overrides,
  };
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
  }
  return value;
}

module.exports = {
  domain,
  plan,
  artifactTypes,
  artifact,
  facts,
  contract,
  runningControl,
  deepFreeze,
};
```

- [ ] **Step 5：创建 `server/tests/directorNext/plan.test.js`**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { domain, plan, artifact, facts } = require("./fixtures");

function step(overrides) {
  return {
    id: "a",
    label: "A",
    requires: [],
    produces: "type_a",
    needs: [],
    gateable: false,
    overwrites: [],
    ...overrides,
  };
}

test("definePlan rejects duplicate step ids", () => {
  assert.throws(
    () =>
      domain.definePlan({
        version: "v",
        externalArtifacts: [],
        steps: [step({ id: "a", produces: "x" }), step({ id: "a", produces: "y" })],
      }),
    (error) => error.name === "PlanValidationError" && /duplicate step id: a/.test(error.message),
  );
});

test("definePlan rejects two steps producing the same artifact type", () => {
  assert.throws(
    () =>
      domain.definePlan({
        version: "v",
        externalArtifacts: [],
        steps: [step({ id: "a", produces: "x" }), step({ id: "b", produces: "x" })],
      }),
    (error) => error.name === "PlanValidationError" && /produced by both/.test(error.message),
  );
});

test("definePlan rejects unknown required and overwritten artifact types", () => {
  assert.throws(
    () =>
      domain.definePlan({
        version: "v",
        externalArtifacts: [],
        steps: [step({ id: "a", produces: "x", requires: ["missing"] })],
      }),
    /requires unknown artifact type missing/,
  );
  assert.throws(
    () =>
      domain.definePlan({
        version: "v",
        externalArtifacts: [],
        steps: [step({ id: "a", produces: "x", overwrites: ["missing"] })],
      }),
    /overwrites unknown artifact type missing/,
  );
});

test("definePlan rejects dependency cycles", () => {
  assert.throws(
    () =>
      domain.definePlan({
        version: "v",
        externalArtifacts: [],
        steps: [
          step({ id: "a", produces: "x", requires: ["y"] }),
          step({ id: "b", produces: "y", requires: ["x"] }),
        ],
      }),
    (error) => error.name === "PlanValidationError" && /cycle/.test(error.message),
  );
});

test("definePlan returns a frozen plan", () => {
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.steps), true);
  assert.equal(Object.isFrozen(plan.steps[0]), true);
});

test("readySteps only offers steps whose requirements are satisfied", () => {
  const seedOnly = facts([artifact("novel_seed")]);
  assert.deepEqual(
    domain.readySteps(plan, seedOnly, { requireConfirmed: false }).map((s) => s.id),
    ["story_macro"],
  );

  const afterMacro = facts([artifact("novel_seed"), artifact("story_macro")]);
  assert.deepEqual(
    domain.readySteps(plan, afterMacro, { requireConfirmed: false }).map((s) => s.id),
    ["character_cast"],
  );

  const afterCast = facts([
    artifact("novel_seed"),
    artifact("story_macro"),
    artifact("character_cast"),
  ]);
  assert.deepEqual(
    domain.readySteps(plan, afterCast, { requireConfirmed: false }).map((s) => s.id),
    ["volume_strategy"],
  );
});

test("a stale artifact makes its step runnable again and its stale downstream steps wait", () => {
  const withStaleCast = facts([
    artifact("novel_seed"),
    artifact("story_macro"),
    artifact("character_cast", { status: "stale" }),
    artifact("volume_strategy", { status: "stale" }),
    artifact("chapter_list", { status: "stale" }),
  ]);
  assert.deepEqual(
    domain.readySteps(plan, withStaleCast, { requireConfirmed: false }).map((s) => s.id),
    ["character_cast"],
  );
});

test("downstreamArtifactTypes returns the transitive downstream types in plan order", () => {
  assert.deepEqual(domain.downstreamArtifactTypes(plan, "story_macro"), [
    "character_cast",
    "volume_strategy",
    "chapter_list",
  ]);
  assert.deepEqual(domain.downstreamArtifactTypes(plan, "character_cast"), [
    "volume_strategy",
    "chapter_list",
  ]);
  assert.deepEqual(domain.downstreamArtifactTypes(plan, "chapter_list"), []);
  assert.deepEqual(domain.downstreamArtifactTypes(plan, "novel_seed"), [
    "story_macro",
    "character_cast",
    "volume_strategy",
    "chapter_list",
  ]);
  assert.deepEqual(domain.downstreamArtifactTypes(plan, "chapter_draft"), []);
});

test("the latest artifact version decides whether a type is satisfied", () => {
  const replaced = facts([
    artifact("novel_seed"),
    artifact("story_macro", { version: 1, status: "stale" }),
    artifact("story_macro", { version: 2, status: "draft" }),
  ]);
  assert.equal(domain.isArtifactSatisfied(replaced, "story_macro", false), true);

  const superseded = facts([
    artifact("novel_seed"),
    artifact("story_macro", { version: 1, status: "draft" }),
    artifact("story_macro", { version: 2, status: "stale" }),
  ]);
  assert.equal(domain.isArtifactSatisfied(superseded, "story_macro", false), false);
});

test("requireConfirmed only accepts confirmed or user_edited artifacts as dependencies", () => {
  const draftMacro = facts([artifact("novel_seed"), artifact("story_macro", { status: "draft" })]);
  assert.deepEqual(
    domain.readySteps(plan, draftMacro, { requireConfirmed: true }).map((s) => s.id),
    [],
  );

  for (const status of ["confirmed", "user_edited"]) {
    const unlocked = facts([artifact("novel_seed"), artifact("story_macro", { status })]);
    assert.deepEqual(
      domain.readySteps(plan, unlocked, { requireConfirmed: true }).map((s) => s.id),
      ["character_cast"],
    );
  }
});

test("stepIdsInScope limits both ready and remaining steps", () => {
  const seedOnly = facts([artifact("novel_seed")]);
  assert.deepEqual(
    domain.readySteps(plan, seedOnly, { requireConfirmed: false, stepIdsInScope: ["character_cast"] }).map((s) => s.id),
    [],
  );
  assert.deepEqual(
    domain.remainingSteps(plan, seedOnly, ["story_macro", "character_cast"]).map((s) => s.id),
    ["story_macro", "character_cast"],
  );
  assert.deepEqual(
    domain.remainingSteps(plan, seedOnly, null).map((s) => s.id),
    ["story_macro", "character_cast", "volume_strategy", "chapter_list"],
  );
});
```

- [ ] **Step 6：编译并运行**

```powershell
pnpm --filter @ai-novel/server build
node --test server/tests/directorNext/plan.test.js
```

预期：编译成功；`tests 11`、`pass 11`、`fail 0`。

- [ ] **Step 7：提交**

```powershell
git add server/src/modules/director/domain/types.ts server/src/modules/director/domain/plan.ts server/src/modules/director/domain/index.ts server/tests/directorNext/fixtures.js server/tests/directorNext/plan.test.js
git commit -m "优化：新增自动导演内核的步骤计划与依赖推导"
```

---

### Task 2：运行控制状态机（6 个用例）

**Files:**
- Create: `server/src/modules/director/domain/control.ts`
- Modify: `server/src/modules/director/domain/index.ts`
- Create: `server/tests/directorNext/control.test.js`

**Interfaces:**
- Consumes：Task 1 的 `RunControl`、`RunPause`、`RunStatus`、`ArtifactType`。
- Produces：`applyEvent(control, event, expectedVersion?)`、`initialControl()`、`isTerminalStatus`、`RUN_STATUSES`、`RUN_EVENT_TYPES`、`InvalidTransitionError`、`VersionConflictError`、类型 `RunEvent`。

- [ ] **Step 1：创建 `server/src/modules/director/domain/control.ts`**

```ts
import type { ArtifactType, RunControl, RunPause, RunStatus } from "./types";

export type RunEvent =
  | { type: "start" }
  | { type: "step_started"; stepId: string }
  | { type: "step_finished" }
  | { type: "open_gate"; gateId: string; artifactTypes: readonly ArtifactType[] }
  | { type: "resolve_gate" }
  | { type: "pause"; pause: RunPause }
  | { type: "resume" }
  | { type: "complete" }
  | { type: "fail"; reason: string }
  | { type: "cancel" };

export type RunEventType = RunEvent["type"];

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: RunStatus,
    readonly eventType: RunEventType,
  ) {
    super(`invalid run transition: ${from} --${eventType}-->`);
    this.name = "InvalidTransitionError";
  }
}

export class VersionConflictError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`run control version conflict: expected ${expected}, actual ${actual}`);
    this.name = "VersionConflictError";
  }
}

const TRANSITIONS: Record<RunStatus, Partial<Record<RunEventType, RunStatus>>> = {
  queued: { start: "running", cancel: "cancelled" },
  running: {
    step_started: "running",
    step_finished: "running",
    open_gate: "waiting_gate",
    pause: "paused",
    complete: "completed",
    fail: "failed",
    cancel: "cancelled",
  },
  waiting_gate: { resolve_gate: "running", fail: "failed", cancel: "cancelled" },
  paused: { resume: "running", cancel: "cancelled" },
  completed: {},
  failed: {},
  cancelled: {},
};

export const RUN_STATUSES: readonly RunStatus[] = [
  "queued",
  "running",
  "waiting_gate",
  "paused",
  "completed",
  "failed",
  "cancelled",
];

export const RUN_EVENT_TYPES: readonly RunEventType[] = [
  "start",
  "step_started",
  "step_finished",
  "open_gate",
  "resolve_gate",
  "pause",
  "resume",
  "complete",
  "fail",
  "cancel",
];

export function initialControl(): RunControl {
  return {
    version: 0,
    status: "queued",
    pause: null,
    gate: null,
    cursorStepId: null,
    failureReason: null,
  };
}

export function isTerminalStatus(status: RunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function applyEvent(
  control: RunControl,
  event: RunEvent,
  expectedVersion?: number,
): RunControl {
  if (expectedVersion !== undefined && expectedVersion !== control.version) {
    throw new VersionConflictError(expectedVersion, control.version);
  }
  const nextStatus = TRANSITIONS[control.status][event.type];
  if (!nextStatus) {
    throw new InvalidTransitionError(control.status, event.type);
  }

  const next: RunControl = {
    ...control,
    version: control.version + 1,
    status: nextStatus,
  };

  switch (event.type) {
    case "step_started":
      next.cursorStepId = event.stepId;
      break;
    case "step_finished":
      next.cursorStepId = null;
      break;
    case "open_gate":
      next.gate = { id: event.gateId, artifactTypes: [...event.artifactTypes] };
      next.cursorStepId = null;
      break;
    case "resolve_gate":
      next.gate = null;
      break;
    case "pause":
      next.pause = { ...event.pause };
      next.cursorStepId = null;
      break;
    case "resume":
      next.pause = null;
      break;
    case "fail":
      next.failureReason = event.reason;
      next.cursorStepId = null;
      next.gate = null;
      break;
    case "complete":
    case "cancel":
      next.cursorStepId = null;
      next.gate = null;
      break;
    default:
      break;
  }
  return next;
}
```

- [ ] **Step 2：把 `index.ts` 替换为以下内容**

```ts
export * from "./types";
export * from "./plan";
export * from "./control";
```

- [ ] **Step 3：创建 `server/tests/directorNext/control.test.js`**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { domain } = require("./fixtures");

// 测试自带的期望表，独立于实现；修改迁移表必须同时修改这里。
const ALLOWED = {
  queued: { start: "running", cancel: "cancelled" },
  running: {
    step_started: "running",
    step_finished: "running",
    open_gate: "waiting_gate",
    pause: "paused",
    complete: "completed",
    fail: "failed",
    cancel: "cancelled",
  },
  waiting_gate: { resolve_gate: "running", fail: "failed", cancel: "cancelled" },
  paused: { resume: "running", cancel: "cancelled" },
  completed: {},
  failed: {},
  cancelled: {},
};

function sampleEvent(type) {
  switch (type) {
    case "step_started":
      return { type, stepId: "story_macro" };
    case "open_gate":
      return { type, gateId: "gate-1", artifactTypes: ["story_macro"] };
    case "pause":
      return { type, pause: { kind: "manual_recovery", reason: "test" } };
    case "fail":
      return { type, reason: "boom" };
    default:
      return { type };
  }
}

function controlIn(status) {
  return { ...domain.initialControl(), status, version: 5 };
}

test("the transition table is exhaustive over every status and event type", () => {
  assert.deepEqual([...domain.RUN_STATUSES].sort(), Object.keys(ALLOWED).sort());
  for (const status of domain.RUN_STATUSES) {
    for (const eventType of domain.RUN_EVENT_TYPES) {
      const expected = ALLOWED[status][eventType];
      const event = sampleEvent(eventType);
      if (expected) {
        const next = domain.applyEvent(controlIn(status), event);
        assert.equal(next.status, expected, `${status} --${eventType}--> ${expected}`);
        assert.equal(next.version, 6, "version increments on every transition");
      } else {
        assert.throws(
          () => domain.applyEvent(controlIn(status), event),
          (error) => error.name === "InvalidTransitionError" && error.from === status,
          `${status} --${eventType}--> must be rejected`,
        );
      }
    }
  }
});

test("a paused run can only be left by resume or cancel", () => {
  const leaving = domain.RUN_EVENT_TYPES.filter((eventType) => {
    try {
      domain.applyEvent(controlIn("paused"), sampleEvent(eventType));
      return true;
    } catch {
      return false;
    }
  });
  assert.deepEqual(leaving.sort(), ["cancel", "resume"]);
});

test("terminal runs accept no events", () => {
  for (const status of ["completed", "failed", "cancelled"]) {
    assert.equal(domain.isTerminalStatus(status), true);
    for (const eventType of domain.RUN_EVENT_TYPES) {
      assert.throws(() => domain.applyEvent(controlIn(status), sampleEvent(eventType)));
    }
  }
  assert.equal(domain.isTerminalStatus("running"), false);
});

test("expectedVersion mismatch raises a version conflict and changes nothing", () => {
  const control = controlIn("queued");
  assert.throws(
    () => domain.applyEvent(control, { type: "start" }, 4),
    (error) => error.name === "VersionConflictError" && error.expected === 4 && error.actual === 5,
  );
  assert.equal(control.status, "queued");
  assert.equal(domain.applyEvent(control, { type: "start" }, 5).status, "running");
});

test("events carry their payload into the control state", () => {
  let control = domain.applyEvent(domain.initialControl(), { type: "start" });
  control = domain.applyEvent(control, { type: "step_started", stepId: "story_macro" });
  assert.equal(control.cursorStepId, "story_macro");
  control = domain.applyEvent(control, { type: "step_finished" });
  assert.equal(control.cursorStepId, null);

  control = domain.applyEvent(control, {
    type: "open_gate",
    gateId: "gate-1",
    artifactTypes: ["story_macro", "character_cast"],
  });
  assert.equal(control.status, "waiting_gate");
  assert.deepEqual(control.gate, { id: "gate-1", artifactTypes: ["story_macro", "character_cast"] });
  control = domain.applyEvent(control, { type: "resolve_gate" });
  assert.equal(control.gate, null);

  control = domain.applyEvent(control, {
    type: "pause",
    pause: { kind: "replan", reason: "need replan" },
  });
  assert.deepEqual(control.pause, { kind: "replan", reason: "need replan" });
  control = domain.applyEvent(control, { type: "resume" });
  assert.equal(control.pause, null);
  assert.equal(control.status, "running");

  control = domain.applyEvent(control, { type: "fail", reason: "boom" });
  assert.equal(control.failureReason, "boom");
});

test("applyEvent never mutates its input", () => {
  const control = Object.freeze({ ...domain.initialControl() });
  assert.doesNotThrow(() => domain.applyEvent(control, { type: "start" }));
});
```

- [ ] **Step 4：编译并运行**

```powershell
pnpm --filter @ai-novel/server build
node --test server/tests/directorNext/control.test.js
```

预期：`tests 6`、`pass 6`、`fail 0`。

- [ ] **Step 5：提交**

```powershell
git add server/src/modules/director/domain/control.ts server/src/modules/director/domain/index.ts server/tests/directorNext/control.test.js
git commit -m "优化：新增自动导演内核的运行控制状态机"
```

---

### Task 3：守卫（12 个用例）

**Files:**
- Create: `server/src/modules/director/domain/guard.ts`
- Modify: `server/src/modules/director/domain/index.ts`
- Create: `server/tests/directorNext/guard.test.js`

**Interfaces:**
- Consumes：Task 1 的 `isArtifactSatisfied`、`latestArtifact`、`remainingSteps` 与全部类型。
- Produces：`checkAction(input): GuardVerdict`，类型 `GuardCode`、`GuardVerdict`、`GuardInput`。

- [ ] **Step 1：创建 `server/src/modules/director/domain/guard.ts`**

```ts
import { isArtifactSatisfied, latestArtifact, remainingSteps } from "./plan";
import type { Action, FactsSnapshot, PlanDefinition, RunContract, RunControl } from "./types";

export type GuardCode =
  | "run_not_active"
  | "rejection_budget_exhausted"
  | "unknown_step"
  | "step_out_of_scope"
  | "budget_exceeded"
  | "requires_unmet"
  | "protected_content"
  | "invalid_action"
  | "steps_remaining";

export type GuardVerdict = { ok: true } | { ok: false; code: GuardCode; message: string };

export interface GuardInput {
  action: Action;
  plan: PlanDefinition;
  contract: RunContract;
  control: RunControl;
  facts: FactsSnapshot;
  tokensUsed: number;
  rejections: number;
}

function reject(code: GuardCode, message: string): GuardVerdict {
  return { ok: false, code, message };
}

export function checkAction(input: GuardInput): GuardVerdict {
  const { action, plan, contract, control, facts } = input;

  if (control.status !== "running") {
    return reject("run_not_active", `run is ${control.status}, actions are only accepted while running`);
  }
  if (input.rejections >= contract.rejectionBudget) {
    return reject(
      "rejection_budget_exhausted",
      `rejected actions reached the budget of ${contract.rejectionBudget}`,
    );
  }

  switch (action.kind) {
    case "run_step": {
      const step = plan.steps.find((candidate) => candidate.id === action.stepId);
      if (!step) {
        return reject("unknown_step", `step ${action.stepId} is not in the plan`);
      }
      if (contract.stepIdsInScope && !contract.stepIdsInScope.includes(step.id)) {
        return reject("step_out_of_scope", `step ${step.id} is outside the run scope`);
      }
      if (contract.tokenBudget !== null && input.tokensUsed >= contract.tokenBudget) {
        return reject(
          "budget_exceeded",
          `token usage ${input.tokensUsed} reached the budget of ${contract.tokenBudget}`,
        );
      }
      const requireConfirmed = contract.driver === "assisted";
      const missing = step.requires.filter(
        (type) => !isArtifactSatisfied(facts, type, requireConfirmed),
      );
      if (missing.length > 0) {
        return reject("requires_unmet", `step ${step.id} is missing: ${missing.join(", ")}`);
      }
      const touched = [...step.overwrites, step.produces];
      const protectedType = touched.find(
        (type) => latestArtifact(facts, type)?.protectedUserContent === true,
      );
      if (protectedType) {
        return reject(
          "protected_content",
          `step ${step.id} would overwrite protected user content in ${protectedType}`,
        );
      }
      return { ok: true };
    }
    case "open_gate": {
      if (contract.driver !== "assisted") {
        return reject("invalid_action", "gates are only available to assisted runs");
      }
      if (action.artifactTypes.length === 0) {
        return reject("invalid_action", "a gate must reference at least one artifact type");
      }
      const missing = action.artifactTypes.filter((type) => !isArtifactSatisfied(facts, type, false));
      if (missing.length > 0) {
        return reject("invalid_action", `gate references missing artifacts: ${missing.join(", ")}`);
      }
      return { ok: true };
    }
    case "record_debt": {
      if (!Number.isInteger(action.chapterOrder) || action.chapterOrder < 1 || !action.code) {
        return reject("invalid_action", "a quality debt needs a chapter order >= 1 and a code");
      }
      return { ok: true };
    }
    case "pause":
    case "fail":
      return { ok: true };
    case "complete": {
      const remaining = remainingSteps(plan, facts, contract.stepIdsInScope);
      if (remaining.length > 0) {
        return reject(
          "steps_remaining",
          `cannot complete, steps remaining: ${remaining.map((step) => step.id).join(", ")}`,
        );
      }
      return { ok: true };
    }
    default: {
      const unreachable: never = action;
      return reject("invalid_action", `unsupported action ${JSON.stringify(unreachable)}`);
    }
  }
}
```

- [ ] **Step 2：把 `index.ts` 替换为以下内容**

```ts
export * from "./types";
export * from "./plan";
export * from "./control";
export * from "./guard";
```

- [ ] **Step 3：创建 `server/tests/directorNext/guard.test.js`**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { domain, plan, artifact, facts, contract, runningControl } = require("./fixtures");

function check(overrides = {}) {
  return domain.checkAction({
    action: { kind: "run_step", stepId: "story_macro" },
    plan,
    contract: contract(),
    control: runningControl(),
    facts: facts([artifact("novel_seed")]),
    tokensUsed: 0,
    rejections: 0,
    ...overrides,
  });
}

function codeOf(verdict) {
  assert.equal(verdict.ok, false, "expected a rejection");
  return verdict.code;
}

test("a legal run_step is accepted", () => {
  assert.deepEqual(check(), { ok: true });
});

test("actions are only accepted while the run is running", () => {
  for (const status of ["queued", "waiting_gate", "paused", "completed", "failed", "cancelled"]) {
    assert.equal(codeOf(check({ control: runningControl({ status }) })), "run_not_active");
  }
});

test("run_step rejects unknown steps, out-of-scope steps and unmet requirements", () => {
  assert.equal(codeOf(check({ action: { kind: "run_step", stepId: "nope" } })), "unknown_step");
  assert.equal(
    codeOf(check({ contract: contract({ stepIdsInScope: ["character_cast"] }) })),
    "step_out_of_scope",
  );
  assert.equal(
    codeOf(check({ action: { kind: "run_step", stepId: "character_cast" } })),
    "requires_unmet",
  );
});

test("assisted runs require confirmed dependencies, auto runs accept drafts", () => {
  const draftMacro = facts([artifact("novel_seed"), artifact("story_macro", { status: "draft" })]);
  const action = { kind: "run_step", stepId: "character_cast" };
  assert.deepEqual(check({ action, facts: draftMacro }), { ok: true });
  assert.equal(
    codeOf(check({ action, facts: draftMacro, contract: contract({ driver: "assisted" }) })),
    "requires_unmet",
  );
  const confirmedMacro = facts([artifact("novel_seed"), artifact("story_macro", { status: "confirmed" })]);
  assert.deepEqual(
    check({ action, facts: confirmedMacro, contract: contract({ driver: "assisted" }) }),
    { ok: true },
  );
});

test("run_step never overwrites protected user content", () => {
  const protectedMacro = facts([
    artifact("novel_seed"),
    artifact("story_macro", { status: "stale", protectedUserContent: true }),
  ]);
  assert.equal(codeOf(check({ facts: protectedMacro })), "protected_content");
});

test("run_step is rejected once the token budget is reached", () => {
  assert.deepEqual(check({ contract: contract({ tokenBudget: 100 }), tokensUsed: 99 }), { ok: true });
  assert.equal(codeOf(check({ contract: contract({ tokenBudget: 100 }), tokensUsed: 100 })), "budget_exceeded");
});

test("open_gate is only valid for assisted runs with existing artifacts", () => {
  const withMacro = facts([artifact("novel_seed"), artifact("story_macro")]);
  const gate = { kind: "open_gate", gateId: "g1", artifactTypes: ["story_macro"] };
  assert.equal(codeOf(check({ action: gate, facts: withMacro })), "invalid_action");
  assert.deepEqual(
    check({ action: gate, facts: withMacro, contract: contract({ driver: "assisted" }) }),
    { ok: true },
  );
  assert.equal(
    codeOf(
      check({
        action: { kind: "open_gate", gateId: "g1", artifactTypes: [] },
        facts: withMacro,
        contract: contract({ driver: "assisted" }),
      }),
    ),
    "invalid_action",
  );
  assert.equal(
    codeOf(
      check({
        action: { kind: "open_gate", gateId: "g1", artifactTypes: ["character_cast"] },
        facts: withMacro,
        contract: contract({ driver: "assisted" }),
      }),
    ),
    "invalid_action",
  );
});

test("record_debt validates its payload", () => {
  assert.deepEqual(check({ action: { kind: "record_debt", chapterOrder: 3, code: "quality.local_patch" } }), { ok: true });
  assert.equal(codeOf(check({ action: { kind: "record_debt", chapterOrder: 0, code: "x" } })), "invalid_action");
  assert.equal(codeOf(check({ action: { kind: "record_debt", chapterOrder: 1.5, code: "x" } })), "invalid_action");
  assert.equal(codeOf(check({ action: { kind: "record_debt", chapterOrder: 1, code: "" } })), "invalid_action");
});

test("complete is rejected while steps remain, accepted when none remain", () => {
  assert.equal(codeOf(check({ action: { kind: "complete" } })), "steps_remaining");
  const allDone = facts([
    artifact("novel_seed"),
    artifact("story_macro"),
    artifact("character_cast"),
    artifact("volume_strategy"),
    artifact("chapter_list"),
  ]);
  assert.deepEqual(check({ action: { kind: "complete" }, facts: allDone }), { ok: true });
  assert.deepEqual(
    check({ action: { kind: "complete" }, contract: contract({ stepIdsInScope: ["story_macro"] }), facts: facts([artifact("novel_seed"), artifact("story_macro")]) }),
    { ok: true },
  );
});

test("pause and fail are always accepted while running", () => {
  assert.deepEqual(check({ action: { kind: "pause", pause: { kind: "safety", reason: "x" } } }), { ok: true });
  assert.deepEqual(check({ action: { kind: "fail", reason: "x" } }), { ok: true });
});

test("the rejection budget stops a misbehaving orchestrator", () => {
  assert.equal(codeOf(check({ rejections: 3 })), "rejection_budget_exhausted");
  assert.deepEqual(check({ rejections: 2 }), { ok: true });
});

// 契约测试：一个故意提交非法动作的“假 agent”，守卫必须逐个拒绝，且不依赖 agent 自觉。
test("a misbehaving agent orchestrator cannot get illegal actions past the guard", () => {
  const badAgent = {
    proposals: [
      { kind: "run_step", stepId: "does_not_exist" },
      { kind: "run_step", stepId: "chapter_list" },
      { kind: "complete" },
      { kind: "open_gate", gateId: "g", artifactTypes: ["story_macro"] },
      { kind: "record_debt", chapterOrder: -1, code: "x" },
    ],
    next() {
      return this.proposals.shift();
    },
  };
  const expectedCodes = ["unknown_step", "requires_unmet", "steps_remaining", "invalid_action", "invalid_action"];
  const seen = [];
  let rejections = 0;
  for (let index = 0; index < expectedCodes.length; index += 1) {
    const verdict = check({ action: badAgent.next(), rejections: Math.min(rejections, 2) });
    assert.equal(verdict.ok, false);
    seen.push(verdict.code);
    rejections += 1;
  }
  assert.deepEqual(seen, expectedCodes);
  assert.equal(codeOf(check({ action: { kind: "run_step", stepId: "story_macro" }, rejections })), "rejection_budget_exhausted");
});
```

- [ ] **Step 4：编译并运行**

```powershell
pnpm --filter @ai-novel/server build
node --test server/tests/directorNext/guard.test.js
```

预期：`tests 12`、`pass 12`、`fail 0`。

- [ ] **Step 5：提交**

```powershell
git add server/src/modules/director/domain/guard.ts server/src/modules/director/domain/index.ts server/tests/directorNext/guard.test.js
git commit -m "优化：新增自动导演内核的动作守卫"
```

---

### Task 4：计划编排器（7 个用例）

**Files:**
- Create: `server/src/modules/director/domain/planOrchestrator.ts`
- Modify: `server/src/modules/director/domain/index.ts`
- Create: `server/tests/directorNext/planOrchestrator.test.js`

**Interfaces:**
- Consumes：Task 1 的 `readySteps`、`remainingSteps`、`Orchestrator`；Task 3 的 `checkAction`（仅测试使用）。
- Produces：`createPlanOrchestrator(): Orchestrator`。

- [ ] **Step 1：创建 `server/src/modules/director/domain/planOrchestrator.ts`**

```ts
import { readySteps, remainingSteps } from "./plan";
import type { Orchestrator } from "./types";

export function createPlanOrchestrator(): Orchestrator {
  return {
    next({ plan, contract, facts }) {
      if (facts.stopSignal) {
        return {
          kind: "pause",
          pause: {
            kind: facts.stopSignal.kind === "replan" ? "replan" : "safety",
            reason: facts.stopSignal.reason,
          },
        };
      }

      const ready = readySteps(plan, facts, {
        requireConfirmed: false,
        stepIdsInScope: contract.stepIdsInScope,
      });
      if (ready.length > 0) {
        return { kind: "run_step", stepId: ready[0].id };
      }

      if (remainingSteps(plan, facts, contract.stepIdsInScope).length === 0) {
        return { kind: "complete" };
      }
      return { kind: "pause", pause: { kind: "manual_recovery", reason: "no_runnable_step" } };
    },
  };
}
```

- [ ] **Step 2：把 `index.ts` 替换为以下内容**

```ts
export * from "./types";
export * from "./plan";
export * from "./control";
export * from "./guard";
export * from "./planOrchestrator";
```

- [ ] **Step 3：创建 `server/tests/directorNext/planOrchestrator.test.js`**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { domain, plan, artifact, facts, contract, runningControl, deepFreeze } = require("./fixtures");

const orchestrator = domain.createPlanOrchestrator();

function next(factsSnapshot, contractOverrides = {}) {
  return orchestrator.next({ plan, contract: contract(contractOverrides), facts: factsSnapshot });
}

test("the plan orchestrator walks the plan in dependency order", () => {
  assert.deepEqual(next(facts([artifact("novel_seed")])), { kind: "run_step", stepId: "story_macro" });
  assert.deepEqual(next(facts([artifact("novel_seed"), artifact("story_macro")])), {
    kind: "run_step",
    stepId: "character_cast",
  });
});

test("the plan orchestrator completes when nothing remains in scope", () => {
  const allDone = facts([
    artifact("novel_seed"),
    artifact("story_macro"),
    artifact("character_cast"),
    artifact("volume_strategy"),
    artifact("chapter_list"),
  ]);
  assert.deepEqual(next(allDone), { kind: "complete" });
  assert.deepEqual(
    next(facts([artifact("novel_seed"), artifact("story_macro")]), { stepIdsInScope: ["story_macro"] }),
    { kind: "complete" },
  );
});

test("quality debt never stops the orchestrator", () => {
  const manyDebts = Array.from({ length: 100 }, (_, index) => ({
    chapterOrder: index + 1,
    code: "quality.local_patch_plan",
  }));
  assert.deepEqual(next(facts([artifact("novel_seed")], { debts: manyDebts })), {
    kind: "run_step",
    stepId: "story_macro",
  });
});

test("only explicit stop signals pause the run", () => {
  const seed = [artifact("novel_seed")];
  const cases = [
    [{ kind: "replan", reason: "r" }, "replan"],
    [{ kind: "safety", reason: "r" }, "safety"],
    [{ kind: "data_integrity", reason: "r" }, "safety"],
    [{ kind: "no_usable_content", reason: "r" }, "safety"],
  ];
  for (const [stopSignal, expectedKind] of cases) {
    assert.deepEqual(next(facts(seed, { stopSignal })), {
      kind: "pause",
      pause: { kind: expectedKind, reason: "r" },
    });
  }
});

test("when nothing can run but work remains, the run pauses for manual recovery", () => {
  assert.deepEqual(next(facts([])), {
    kind: "pause",
    pause: { kind: "manual_recovery", reason: "no_runnable_step" },
  });
});

test("next() is a pure function of its input", () => {
  const input = deepFreeze({
    plan,
    contract: contract(),
    facts: facts([artifact("novel_seed"), artifact("story_macro")]),
  });
  assert.deepEqual(orchestrator.next(input), orchestrator.next(input));
});

// 崩溃恢复：进度只来自产物台账。在任意步骤边界丢弃所有内存状态后重启，
// 每个步骤仍然恰好执行一次，最终得到 complete。
test("crash at any step boundary resumes from the ledger without repeating steps", () => {
  const stepCount = plan.steps.length;
  for (let crashAfter = 0; crashAfter <= stepCount; crashAfter += 1) {
    const ledger = [artifact("novel_seed")];
    const executions = [];

    function runLoop(stopAfterExecutions) {
      let executed = 0;
      for (let guardIterations = 0; guardIterations < 20; guardIterations += 1) {
        const snapshot = facts(ledger.map((entry) => ({ ...entry })));
        const action = orchestrator.next({ plan, contract: contract(), facts: snapshot });
        const verdict = domain.checkAction({
          action,
          plan,
          contract: contract(),
          control: runningControl(),
          facts: snapshot,
          tokensUsed: 0,
          rejections: 0,
        });
        assert.equal(verdict.ok, true, `guard must accept ${JSON.stringify(action)}`);
        if (action.kind === "complete") {
          return "complete";
        }
        assert.equal(action.kind, "run_step");
        if (executed >= stopAfterExecutions) {
          return "crashed";
        }
        executions.push(action.stepId);
        const step = plan.steps.find((candidate) => candidate.id === action.stepId);
        ledger.push(artifact(step.produces));
        executed += 1;
      }
      throw new Error("loop did not terminate");
    }

    const first = runLoop(crashAfter);
    assert.equal(first, crashAfter >= stepCount ? "complete" : "crashed");
    const second = runLoop(Infinity);
    assert.equal(second, "complete");
    assert.deepEqual(executions, plan.steps.map((candidate) => candidate.id));
  }
});
```

- [ ] **Step 4：编译并运行**

```powershell
pnpm --filter @ai-novel/server build
node --test server/tests/directorNext/planOrchestrator.test.js
```

预期：`tests 7`、`pass 7`、`fail 0`。

- [ ] **Step 5：提交**

```powershell
git add server/src/modules/director/domain/planOrchestrator.ts server/src/modules/director/domain/index.ts server/tests/directorNext/planOrchestrator.test.js
git commit -m "优化：新增自动导演内核的全自动计划编排器"
```

---

### Task 5：展示投影（10 个用例）

**Files:**
- Create: `server/src/modules/director/domain/projection.ts`
- Modify: `server/src/modules/director/domain/index.ts`
- Create: `server/tests/directorNext/projection.test.js`

**Interfaces:**
- Consumes：Task 1 的 `isArtifactSatisfied` 与类型。
- Produces：`project(input): DashboardView`，类型 `DashboardView`、`ActionDescriptor`、`ArtifactTypeInfo`、`ProjectionInput`。

- [ ] **Step 1：创建 `server/src/modules/director/domain/projection.ts`**

```ts
import { isArtifactSatisfied } from "./plan";
import type {
  ArtifactType,
  Driver,
  FactsSnapshot,
  PauseKind,
  PlanDefinition,
  RunContract,
  RunControl,
  RunStatus,
} from "./types";

export interface ArtifactTypeInfo {
  label: string;
  reviewRoute: string;
}

export interface ActionDescriptor {
  id: string;
  label: string;
  kind: "command" | "navigate";
  primary: boolean;
  command?: "resume" | "cancel" | "open_run";
  target?: string;
}

export interface DashboardView {
  runId: string;
  mode: RunStatus;
  driver: Driver;
  headline: string;
  detail: string | null;
  progress: { done: number; total: number; source: "artifact_ledger" };
  debts: { count: number; chapterOrders: number[] };
  availableActions: ActionDescriptor[];
  sourceRoute: string;
  sourceTrace: {
    controlStatus: RunStatus;
    controlVersion: number;
    pauseKind: PauseKind | null;
    planVersion: string;
  };
}

export interface ProjectionInput {
  contract: RunContract;
  control: RunControl;
  plan: PlanDefinition;
  facts: FactsSnapshot;
  artifactTypes: Readonly<Record<ArtifactType, ArtifactTypeInfo>>;
  sourceRoute: string;
}

const CANCEL_ACTION: ActionDescriptor = {
  id: "cancel",
  label: "取消本次创作",
  kind: "command",
  primary: false,
  command: "cancel",
};

export function project(input: ProjectionInput): DashboardView {
  const { contract, control, plan, facts, artifactTypes, sourceRoute } = input;

  const inScope = plan.steps.filter(
    (step) => !contract.stepIdsInScope || contract.stepIdsInScope.includes(step.id),
  );
  const done = inScope.filter((step) => isArtifactSatisfied(facts, step.produces, false)).length;
  const chapterOrders = [...new Set(facts.debts.map((debt) => debt.chapterOrder))].sort(
    (left, right) => left - right,
  );

  const infoOf = (type: ArtifactType): ArtifactTypeInfo =>
    artifactTypes[type] ?? { label: type, reviewRoute: sourceRoute };

  let headline: string;
  let detail: string | null = null;
  let availableActions: ActionDescriptor[];

  switch (control.status) {
    case "queued":
      headline = "等待开始创作";
      availableActions = [CANCEL_ACTION];
      break;
    case "running": {
      const cursor = plan.steps.find((step) => step.id === control.cursorStepId);
      headline = cursor ? `正在生成「${cursor.label}」` : "正在推进创作";
      availableActions = [CANCEL_ACTION];
      break;
    }
    case "waiting_gate": {
      const types = control.gate?.artifactTypes ?? [];
      headline = `请确认「${types.map((type) => infoOf(type).label).join("、")}」后继续`;
      availableActions = [
        ...types.map(
          (type, index): ActionDescriptor => ({
            id: `review:${type}`,
            label: `去确认「${infoOf(type).label}」`,
            kind: "navigate",
            primary: index === 0,
            target: infoOf(type).reviewRoute,
          }),
        ),
        CANCEL_ACTION,
      ];
      break;
    }
    case "paused": {
      const pauseKind = control.pause?.kind ?? "manual_recovery";
      detail = control.pause?.reason ?? null;
      if (pauseKind === "replan") {
        headline = "需要重新规划后继续";
      } else if (pauseKind === "safety") {
        headline = "检测到风险，暂停中，等待你处理";
      } else {
        headline = "暂停中，等待你从保存进度继续";
      }
      availableActions = [
        {
          id: "resume",
          label: pauseKind === "replan" ? "重新规划后继续" : "从保存进度继续",
          kind: "command",
          primary: true,
          command: "resume",
        },
        CANCEL_ACTION,
      ];
      break;
    }
    case "completed":
      headline = "当前授权范围内的创作已完成";
      availableActions = [];
      break;
    case "failed":
      headline = "创作中断，可从现有内容继续";
      detail = control.failureReason;
      availableActions = [
        {
          id: "open_run",
          label: "从现有内容继续创作",
          kind: "command",
          primary: true,
          command: "open_run",
        },
      ];
      break;
    case "cancelled":
      headline = "本次创作已取消";
      availableActions = [
        {
          id: "open_run",
          label: "从现有内容继续创作",
          kind: "command",
          primary: true,
          command: "open_run",
        },
      ];
      break;
    default: {
      const unreachable: never = control.status;
      throw new Error(`unsupported run status ${String(unreachable)}`);
    }
  }

  return {
    runId: contract.runId,
    mode: control.status,
    driver: contract.driver,
    headline,
    detail,
    progress: { done, total: inScope.length, source: "artifact_ledger" },
    debts: { count: facts.debts.length, chapterOrders },
    availableActions,
    sourceRoute,
    sourceTrace: {
      controlStatus: control.status,
      controlVersion: control.version,
      pauseKind: control.pause?.kind ?? null,
      planVersion: contract.planVersion,
    },
  };
}
```

- [ ] **Step 2：把 `index.ts` 替换为以下最终内容**

```ts
export * from "./types";
export * from "./plan";
export * from "./control";
export * from "./guard";
export * from "./planOrchestrator";
export * from "./projection";
```

- [ ] **Step 3：创建 `server/tests/directorNext/projection.test.js`**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  domain,
  plan,
  artifactTypes,
  artifact,
  facts,
  contract,
  runningControl,
  deepFreeze,
} = require("./fixtures");

function view(overrides = {}) {
  return domain.project({
    contract: contract(),
    control: runningControl(),
    plan,
    facts: facts([artifact("novel_seed")]),
    artifactTypes,
    sourceRoute: "/novels/n1/edit",
    ...overrides,
  });
}

test("project is a pure function of its input", () => {
  const input = deepFreeze({
    contract: contract(),
    control: runningControl({ cursorStepId: "story_macro" }),
    plan,
    facts: facts([artifact("novel_seed")]),
    artifactTypes,
    sourceRoute: "/novels/n1/edit",
  });
  assert.deepEqual(domain.project(input), domain.project(input));
});

test("every run status projects to the same mode name", () => {
  for (const status of domain.RUN_STATUSES) {
    assert.equal(view({ control: runningControl({ status }) }).mode, status);
  }
});

test("running view names the current step and offers only cancel", () => {
  const current = view({ control: runningControl({ cursorStepId: "story_macro" }) });
  assert.equal(current.headline, "正在生成「故事宏观规划」");
  assert.deepEqual(current.availableActions.map((action) => action.id), ["cancel"]);

  assert.equal(view().headline, "正在推进创作");
});

test("waiting_gate view navigates to the review page of each gated artifact", () => {
  const gated = view({
    control: runningControl({
      status: "waiting_gate",
      gate: { id: "g1", artifactTypes: ["story_macro", "character_cast"] },
    }),
  });
  assert.equal(gated.headline, "请确认「故事宏观规划、角色阵容」后继续");
  assert.deepEqual(
    gated.availableActions.map((action) => [action.id, action.kind, action.primary, action.target]),
    [
      ["review:story_macro", "navigate", true, "/novels/n1/edit?stage=story_macro"],
      ["review:character_cast", "navigate", false, "/novels/n1/edit?stage=character"],
      ["cancel", "command", false, undefined],
    ],
  );
});

test("an unregistered artifact type falls back to its type name and the source route", () => {
  const gated = view({
    control: runningControl({ status: "waiting_gate", gate: { id: "g1", artifactTypes: ["mystery"] } }),
  });
  assert.equal(gated.headline, "请确认「mystery」后继续");
  assert.equal(gated.availableActions[0].target, "/novels/n1/edit");
});

test("paused view offers resume as the primary action, worded by pause kind", () => {
  const replan = view({
    control: runningControl({ status: "paused", pause: { kind: "replan", reason: "need replan" } }),
  });
  assert.equal(replan.headline, "需要重新规划后继续");
  assert.equal(replan.detail, "need replan");
  assert.deepEqual(
    replan.availableActions.map((action) => [action.id, action.label, action.primary, action.command]),
    [
      ["resume", "重新规划后继续", true, "resume"],
      ["cancel", "取消本次创作", false, "cancel"],
    ],
  );
  assert.equal(replan.sourceTrace.pauseKind, "replan");

  const manual = view({
    control: runningControl({ status: "paused", pause: { kind: "manual_recovery", reason: "stale" } }),
  });
  assert.equal(manual.availableActions[0].label, "从保存进度继续");

  const safety = view({
    control: runningControl({ status: "paused", pause: { kind: "safety", reason: "risk" } }),
  });
  assert.match(safety.headline, /风险/);
});

test("terminal views", () => {
  assert.deepEqual(view({ control: runningControl({ status: "completed" }) }).availableActions, []);
  const failed = view({ control: runningControl({ status: "failed", failureReason: "boom" }) });
  assert.equal(failed.detail, "boom");
  assert.deepEqual(failed.availableActions.map((action) => action.command), ["open_run"]);
  const cancelled = view({ control: runningControl({ status: "cancelled" }) });
  assert.deepEqual(cancelled.availableActions.map((action) => action.command), ["open_run"]);
});

test("progress comes from the artifact ledger and respects the run scope", () => {
  const partial = facts([artifact("novel_seed"), artifact("story_macro"), artifact("character_cast", { status: "stale" })]);
  const full = view({ facts: partial });
  assert.deepEqual(full.progress, { done: 1, total: 4, source: "artifact_ledger" });

  const scoped = view({
    facts: partial,
    contract: contract({ stepIdsInScope: ["story_macro", "character_cast"] }),
  });
  assert.deepEqual(scoped.progress, { done: 1, total: 2, source: "artifact_ledger" });
});

test("quality debt is summarised without changing the mode", () => {
  const indebted = view({
    facts: facts([artifact("novel_seed")], {
      debts: [
        { chapterOrder: 5, code: "a" },
        { chapterOrder: 2, code: "b" },
        { chapterOrder: 5, code: "c" },
      ],
    }),
  });
  assert.deepEqual(indebted.debts, { count: 3, chapterOrders: [2, 5] });
  assert.equal(indebted.mode, "running");
});

test("the view carries a source route without any task id and a source trace", () => {
  const projected = view({ control: runningControl({ version: 7 }) });
  assert.equal(projected.sourceRoute, "/novels/n1/edit");
  assert.doesNotMatch(JSON.stringify(projected), /taskId|directorTaskId|workspaceTaskId/);
  assert.deepEqual(projected.sourceTrace, {
    controlStatus: "running",
    controlVersion: 7,
    pauseKind: null,
    planVersion: "test-plan-1",
  });
  assert.equal(projected.driver, "auto");
  assert.equal(projected.runId, "run-1");
});
```

- [ ] **Step 4：编译并运行**

```powershell
pnpm --filter @ai-novel/server build
node --test server/tests/directorNext/projection.test.js
```

预期：`tests 10`、`pass 10`、`fail 0`。

- [ ] **Step 5：提交**

```powershell
git add server/src/modules/director/domain/projection.ts server/src/modules/director/domain/index.ts server/tests/directorNext/projection.test.js
git commit -m "优化：新增自动导演内核的展示投影"
```

---

### Task 6：边界测试与整体确认（3 个用例）

**Files:**
- Create: `server/tests/directorNext/boundary.test.js`

- [ ] **Step 1：创建 `server/tests/directorNext/boundary.test.js`**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const moduleRoot = path.resolve(__dirname, "../../src/modules/director");

function listTsFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listTsFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

function importSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

test("the director module exists and has source files", () => {
  assert.equal(fs.existsSync(moduleRoot), true);
  assert.ok(listTsFiles(moduleRoot).length > 0);
});

test("the director module only imports files inside itself", () => {
  const violations = [];
  for (const file of listTsFiles(moduleRoot)) {
    const source = fs.readFileSync(file, "utf8");
    for (const specifier of importSpecifiers(source)) {
      const relative = path.relative(moduleRoot, file);
      if (!specifier.startsWith(".")) {
        violations.push(`${relative} imports package or alias "${specifier}"`);
        continue;
      }
      const resolved = path.resolve(path.dirname(file), specifier);
      if (resolved !== moduleRoot && !resolved.startsWith(`${moduleRoot}${path.sep}`)) {
        violations.push(`${relative} imports outside the module: "${specifier}"`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test("the domain layer contains no persistence, clock or randomness calls", () => {
  const domainRoot = path.join(moduleRoot, "domain");
  const forbidden = [/\bDate\.now\s*\(/, /\bnew Date\s*\(/, /\bMath\.random\s*\(/, /\bprocess\.env\b/];
  const violations = [];
  for (const file of listTsFiles(domainRoot)) {
    const source = fs.readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      if (pattern.test(source)) {
        violations.push(`${path.relative(moduleRoot, file)} matches ${pattern}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});
```

- [ ] **Step 2：编译并运行全部内核测试**

```powershell
pnpm --filter @ai-novel/server build
node --test server/tests/directorNext/plan.test.js server/tests/directorNext/control.test.js server/tests/directorNext/guard.test.js server/tests/directorNext/planOrchestrator.test.js server/tests/directorNext/projection.test.js server/tests/directorNext/boundary.test.js
```

预期：`tests 49`、`pass 49`、`fail 0`。

- [ ] **Step 3：类型检查**

```powershell
pnpm --filter @ai-novel/server typecheck
```

预期：成功，无错误。

- [ ] **Step 4：确认改动范围只有本计划列出的文件**

```powershell
git diff --name-only fbfb10a7..HEAD
```

预期：输出只包含 `docs/` 下已提交的文档，以及 `server/src/modules/director/domain/` 下 7 个文件和 `server/tests/directorNext/` 下 7 个文件。出现其他路径触发 S1。

- [ ] **Step 5：提交**

```powershell
git add server/tests/directorNext/boundary.test.js
git commit -m "优化：新增自动导演内核的模块边界守卫测试"
```

- [ ] **Step 6：按下面的模板写执行报告**（写在对话里交给验收者，不提交）

```markdown
## 计划 01 执行报告
- 分支 / 提交：（列出 6 个提交的哈希）
- 各测试文件结果：plan 11/11、control 6/6、guard 12/12、planOrchestrator 7/7、projection 10/10、boundary 3/3
- 合计：tests 49 / pass 49 / fail 0
- typecheck：通过 / 失败（附错误）
- git diff --name-only 输出：
- 是否触发停止条件：无 / 哪一条
- 与本计划不一致的地方：无 / 逐条说明
```

---

## 验收者检查项（执行者无需操作）

验收者独立执行，不采信执行报告：

1. 重新编译并运行全部 6 个测试文件，确认 49/49。
2. `git diff --name-only fbfb10a7..HEAD` 只含允许的路径。
3. 逐文件比对仓库内容与本计划内嵌内容完全一致（逐字）。
4. 在编译产物上做变异检查，每一项都必须让至少一个测试失败：
   - `control.js`：给 `paused` 增加 `step_finished` 边；给 `failed` 增加 `resume` 边。
   - `guard.js`：跳过受保护内容检查；忽略拒绝次数预算。
   - `plan.js`：把 `stale` 视为已满足；让 `downstreamArtifactTypes` 不再传递。
   - `planOrchestrator.js`：忽略 `stopSignal`。
   - `projection.js`：质量债计数恒为 0。
5. 确认没有 `any`、`@ts-ignore`、`@ts-expect-error`，且 `server/src/services/novel/director/` 没有任何改动。
