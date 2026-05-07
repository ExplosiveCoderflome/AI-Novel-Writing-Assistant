# Prompt Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual `v1/v2` prompt asset versions with stable auto-generated hash versions from `.ts/.prompts.ts` sources, and persist the resolved version through prompt execution diagnostics.

**Architecture:** Introduce a single prompt asset definition helper in `server/src/prompting/core/` that derives a stable hash version from explicit semantic version sources instead of freehand `version` strings. Migrate registry loaders and governed prompt assets to that helper so prompt runner, structured invoke, and `LlmInvocationDiagnostic.promptVersion` continue to consume the asset version transparently.

**Tech Stack:** TypeScript, Node.js built-in `crypto`, PromptAsset registry under `server/src/prompting/`, Node test runner, Prisma-backed LLM diagnostics.

---

### Task 1: Isolate Prompt Versioning Work

**Files:**
- Modify: none

- [ ] **Step 1: Verify the isolated worktree branch and baseline status**

Run: `git branch --show-current`
Expected: `feature/prompt-versioning`

Run: `git status --short`
Expected: no pending code changes before implementation starts.

- [ ] **Step 2: Confirm this task runs from the isolated worktree rooted at the feature branch**

Run: `git rev-parse --show-toplevel`
Expected: `D:/codex/AI-Novel-Writing-Assistant/.worktrees/feature-prompt-versioning`

### Task 2: Lock The First Failing Tests For Prompt Version Semantics

**Files:**
- Test: `server/tests/promptVersioning.test.js`
- Review: `server/src/prompting/core/promptTypes.ts`
- Review: `server/src/prompting/registry.ts`

- [ ] **Step 1: Write a failing test for stable auto-version generation**

```js
test("definePromptAsset derives the same hash version for the same semantic source", async () => {
  const { definePromptAsset } = await import("../dist/prompting/core/promptTypes.js");
  const first = definePromptAsset({
    id: "test.prompt",
    versionSource: {
      template: "system:hello\nuser:world",
      contextPolicy: { maxTokensBudget: 1200 },
      outputSchemaVersion: "schema:test:v1",
    },
    taskType: "planner",
    mode: "text",
    language: "zh",
    contextPolicy: { maxTokensBudget: 1200 },
    render: () => [],
  });
  const second = definePromptAsset({
    id: "test.prompt",
    versionSource: {
      template: "system:hello\nuser:world",
      contextPolicy: { maxTokensBudget: 1200 },
      outputSchemaVersion: "schema:test:v1",
    },
    taskType: "planner",
    mode: "text",
    language: "zh",
    contextPolicy: { maxTokensBudget: 1200 },
    render: () => [],
  });

  assert.equal(first.version, second.version);
  assert.match(first.version, /^h[a-f0-9]{12}$/);
});
```

- [ ] **Step 2: Run the focused test and verify it fails for the expected reason**

Run: `node --test server/tests/promptVersioning.test.js`
Expected: FAIL because `definePromptAsset` and/or `versionSource` support does not exist yet.

- [ ] **Step 3: Add a second failing test for version drift when semantic source changes**

```js
test("definePromptAsset changes version when semantic source changes", async () => {
  const { definePromptAsset } = await import("../dist/prompting/core/promptTypes.js");
  const first = definePromptAsset({ ...baseConfig, versionSource: { template: "A" } });
  const second = definePromptAsset({ ...baseConfig, versionSource: { template: "B" } });
  assert.notEqual(first.version, second.version);
});
```

- [ ] **Step 4: Re-run the focused test and verify it still fails for missing feature reasons**

Run: `node --test server/tests/promptVersioning.test.js`
Expected: FAIL with missing helper / missing auto-version behavior, not syntax or import errors.

### Task 3: Implement Prompt Asset Auto-Versioning

**Files:**
- Modify: `server/src/prompting/core/promptTypes.ts`
- Create: `server/src/prompting/core/promptVersion.ts`

- [ ] **Step 1: Add a stable version hash helper**

```ts
import crypto from "node:crypto";

export function stableStringifyPromptVersionSource(value: unknown): string {
  // Sort object keys recursively so semantically identical sources hash identically.
}

export function buildPromptVersion(source: unknown): string {
  const normalized = stableStringifyPromptVersionSource(source);
  return `h${crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 12)}`;
}
```

- [ ] **Step 2: Extend prompt asset types with explicit semantic version source input**

```ts
export interface PromptAssetVersionSource {
  [key: string]: unknown;
}

export interface PromptAssetDefinition<I, O, R = O>
  extends Omit<PromptAsset<I, O, R>, "version"> {
  versionSource: PromptAssetVersionSource;
}
```

- [ ] **Step 3: Add a single `definePromptAsset()` constructor that fills `version` automatically**

```ts
export function definePromptAsset<I, O, R = O>(
  definition: PromptAssetDefinition<I, O, R>,
): PromptAsset<I, O, R> {
  return {
    ...definition,
    version: buildPromptVersion({
      id: definition.id,
      taskType: definition.taskType,
      mode: definition.mode,
      language: definition.language,
      contextPolicy: definition.contextPolicy,
      versionSource: definition.versionSource,
    }),
  };
}
```

- [ ] **Step 4: Rebuild and re-run the focused versioning test**

Run: `pnpm --filter @ai-novel/server build`
Expected: PASS

Run: `node --test server/tests/promptVersioning.test.js`
Expected: PASS for the two new hash-version tests.

### Task 4: Migrate Registered Prompt Assets To The New Constructor

**Files:**
- Modify: `server/src/prompting/registry.ts`
- Modify: governed prompt asset modules under `server/src/prompting/prompts/**`

- [ ] **Step 1: Identify the shared authoring patterns and convert representative modules first**

```ts
export const chapterWriterPrompt = definePromptAsset({
  id: "novel.chapter.writer",
  versionSource: {
    template: "chapter-writer-v1",
    budgetProfile: NOVEL_PROMPT_BUDGETS.chapterWriter,
    semanticRetry: 1,
  },
  taskType: "novel_generation",
  mode: "text",
  language: "zh",
  contextPolicy: { ... },
  render: (input, context) => [ ... ],
});
```

- [ ] **Step 2: Migrate factory prompts so their parameters participate in the version source**

```ts
export function createVolumeStrategyPrompt(input: { maxVolumeCount: number }) {
  return definePromptAsset({
    id: "novel.volume.strategy",
    versionSource: {
      template: "volume-strategy-v1",
      maxVolumeCount: input.maxVolumeCount,
    },
    ...
  });
}
```

- [ ] **Step 3: Keep registry keys derived from actual loaded asset versions**

```ts
const actualKey = buildPromptAssetKey(asset);
promptAssetLoaderByKey.set(actualKey, entry.load);
```

- [ ] **Step 4: Re-run a focused registry test surface**

Run: `pnpm --filter @ai-novel/server build`
Expected: PASS

Run: `node --test server/tests/prompting-governance.test.js`
Expected: PASS with no direct prompt-governance regressions.

### Task 5: Verify Diagnostics Persist Auto-Resolved Prompt Versions

**Files:**
- Modify: `server/tests/llmInvocationDiagnosticsFireAndForget.test.js`
- Modify: `server/tests/promptVersioning.test.js`
- Review: `server/src/llm/invocationDiagnostics.ts`
- Review: `server/src/prompting/core/promptRunner.ts`

- [ ] **Step 1: Add a failing test for prompt runner metadata carrying the hash version**

```js
test("preparePromptExecution exposes auto-generated promptVersion in invocation metadata", async () => {
  const { definePromptAsset } = await import("../dist/prompting/core/promptTypes.js");
  const { preparePromptExecution } = await import("../dist/prompting/core/promptRunner.js");
  const asset = definePromptAsset({ ... });
  const prepared = preparePromptExecution({ asset, promptInput: {} });
  assert.equal(prepared.invocation.promptVersion, asset.version);
  assert.match(prepared.invocation.promptVersion, /^h[a-f0-9]{12}$/);
});
```

- [ ] **Step 2: Add a failing test for persisted diagnostic records carrying the same version**

```js
test("createLlmInvocationDiagnostic persists the resolved promptVersion", async () => {
  // use promptMeta.promptVersion from a definePromptAsset asset
  // assert prisma create payload receives the hash version unchanged
});
```

- [ ] **Step 3: Run the targeted tests and verify they fail before code changes**

Run: `node --test server/tests/promptVersioning.test.js server/tests/llmInvocationDiagnosticsFireAndForget.test.js`
Expected: FAIL because the tests assert new auto-version semantics not fully wired yet.

- [ ] **Step 4: Adjust any required test harnesses and re-run after implementation**

Run: `node --test server/tests/promptVersioning.test.js server/tests/llmInvocationDiagnosticsFireAndForget.test.js`
Expected: PASS with hash versions preserved end-to-end.

### Task 6: Run Full Targeted Verification

**Files:**
- Modify: none

- [ ] **Step 1: Run server typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 3: Run source length guard**

Run: `pnpm check:source-length`
Expected: PASS

- [ ] **Step 4: Run all prompt-versioning related tests**

Run: `node --test server/tests/promptVersioning.test.js server/tests/prompting-governance.test.js server/tests/llmInvocationDiagnosticsFireAndForget.test.js server/tests/diagnosticCleanupService.test.js`
Expected: PASS

### Task 7: Update Tracking Docs And Prepare The PR

**Files:**
- Modify: `/home/w2450/claude code/ai-novel-optimization-plan.md`
- Modify: `docs/releases/release-notes.md`
- Modify: `README.md`

- [ ] **Step 1: Mark item 12 complete in the optimization plan with execution summary and PR placeholder**

```md
### [x] 12. Prompt 版本化

**PR**: <to fill after push>
**执行结果**: 所有 PromptAsset 版本改为基于语义源自动生成的 hash，诊断表 `promptVersion` 已打通并由测试覆盖。
```

- [ ] **Step 2: Inspect the git diff and decide whether release notes are user-visible**

Run: `git status --short`
Expected: code/test/doc changes for item 12 only.

- [ ] **Step 3: Commit the branch once verification is fresh**

Run: `git add server/src/prompting server/src/llm server/tests docs/superpowers/plans '/home/w2450/claude code/ai-novel-optimization-plan.md' docs/releases/release-notes.md README.md`

Run: `git commit -m "feat(prompting): auto-version prompt assets"`
Expected: PASS
