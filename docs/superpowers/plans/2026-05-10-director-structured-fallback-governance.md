# Director Structured Fallback Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make auto-director candidate generation and candidate patch survive native structured transport failures by using the same prompt-json and direct-call fallback policy already proven on other director-adjacent prompts.

**Architecture:** Keep the fix scoped to the director candidate stage. Disable native structured hint on the affected prompt assets, add a director-local fallback helper in the candidate stage service, and verify the behavior with focused regression tests plus packaged runtime log inspection after rebuild.

**Tech Stack:** TypeScript, Node.js, LangChain/OpenAI integration, raw fetch fallback, Node test runner, Electron portable packaging.

---

### Task 1: Lock Prompt Policy For Director Candidate Assets

**Files:**
- Modify: `D:/codex/AI-Novel-Writing-Assistant/server/src/prompting/prompts/novel/directorPlanning.prompts.ts`
- Test: `D:/codex/AI-Novel-Writing-Assistant/server/tests/directorCandidatePrompt.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  directorCandidatePrompt,
  directorCandidatePatchPrompt,
} = require("../dist/prompting/prompts/novel/directorPlanning.prompts.js");

test("director candidate prompts disable native structured hint", () => {
  assert.equal(directorCandidatePrompt.structuredOutputHint?.mode, "off");
  assert.equal(directorCandidatePatchPrompt.structuredOutputHint?.mode, "off");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\directorCandidatePrompt.test.js
```

Expected: FAIL because one or both prompt assets do not yet expose `structuredOutputHint.mode === "off"`.

- [ ] **Step 3: Write minimal implementation**

Update the prompt assets in `directorPlanning.prompts.ts`:

```ts
structuredOutputHint: {
  mode: "off",
},
```

Apply this to:

- `directorCandidatePrompt`
- `directorCandidatePatchPrompt`

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\directorCandidatePrompt.test.js
```

Expected:

- server build exits 0
- test passes

- [ ] **Step 5: Commit**

```powershell
git -C D:\codex\AI-Novel-Writing-Assistant add server/src/prompting/prompts/novel/directorPlanning.prompts.ts server/tests/directorCandidatePrompt.test.js
git -C D:\codex\AI-Novel-Writing-Assistant commit -m "fix: disable native structured hint for director candidate prompts"
```

### Task 2: Add Director Candidate Fallback For Generate And Patch

**Files:**
- Modify: `D:/codex/AI-Novel-Writing-Assistant/server/src/services/novel/director/novelDirectorCandidateStage.ts`
- Test: `D:/codex/AI-Novel-Writing-Assistant/server/tests/directorCandidateFallback.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
const test = require("node:test");
const assert = require("node:assert/strict");

test("director candidate stage falls back after transport_error for candidate generation", async (t) => {
  const stageModule = require("../dist/services/novel/director/novelDirectorCandidateStage.js");
  const promptRunner = require("../dist/prompting/core/promptRunner.js");
  const structuredInvoke = require("../dist/llm/structuredInvoke.js");
  const parser = require("../dist/llm/structuredInvokeParser.js");
  const outputSchemaModule = require("../dist/llm/structuredOutput.js");

  const service = new stageModule.NovelDirectorCandidateStageService({
    bootstrapTask: async () => {},
    markTaskRunning: async () => {},
    recordCandidateSelectionRequired: async () => {},
  });

  let runStructuredCount = 0;
  let promptJsonCount = 0;
  let directCallCount = 0;

  t.mock.method(promptRunner, "runStructuredPrompt", async () => {
    runStructuredCount += 1;
    throw new outputSchemaModule.StructuredOutputError("[STRUCTURED_OUTPUT:transport_error] boom", {
      category: "transport_error",
      strategy: "json_schema",
      profile: {
        nativeJsonSchema: true,
        nativeJsonObject: true,
        requiresNonThinkingForStructured: false,
        supportsReasoningToggle: false,
        omitMaxTokensForNativeStructured: false,
        preferredStructuredStrategy: "json_schema",
        safeStructuredMaxTokens: undefined,
        family: "openai",
      },
      fallbackAvailable: false,
      fallbackUsed: false,
    });
  });

  t.mock.method(structuredInvoke, "invokeStructuredLlmDetailed", async () => {
    promptJsonCount += 1;
    throw new outputSchemaModule.StructuredOutputError("[STRUCTURED_OUTPUT:transport_error] boom", {
      category: "transport_error",
      strategy: "prompt_json",
      profile: {
        nativeJsonSchema: true,
        nativeJsonObject: true,
        requiresNonThinkingForStructured: false,
        supportsReasoningToggle: false,
        omitMaxTokensForNativeStructured: false,
        preferredStructuredStrategy: "json_schema",
        safeStructuredMaxTokens: undefined,
        family: "openai",
      },
      fallbackAvailable: false,
      fallbackUsed: false,
    });
  });

  t.mock.method(globalThis, "fetch", async () => {
    directCallCount += 1;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ candidates: [{
          workingTitle: "测试标题",
          logline: "测试 logline",
          positioning: "测试定位",
          sellingPoint: "测试卖点",
          coreConflict: "测试冲突",
          protagonistPath: "测试成长",
          endingDirection: "测试结局方向",
          hookStrategy: "测试 hook",
          progressionLoop: "测试推进循环",
          whyItFits: "测试适配原因",
          toneKeywords: ["热血"],
          targetChapterCount: 80,
          titleOptions: [],
        }] }) } }],
      }),
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ candidates: [{
          workingTitle: "测试标题",
          logline: "测试 logline",
          positioning: "测试定位",
          sellingPoint: "测试卖点",
          coreConflict: "测试冲突",
          protagonistPath: "测试成长",
          endingDirection: "测试结局方向",
          hookStrategy: "测试 hook",
          progressionLoop: "测试推进循环",
          whyItFits: "测试适配原因",
          toneKeywords: ["热血"],
          targetChapterCount: 80,
          titleOptions: [],
        }] }) } }],
      }),
    };
  });

  t.mock.method(parser, "parseStructuredLlmRawContentDetailed", async () => ({
    output: {
      candidates: [{
        workingTitle: "测试标题",
        logline: "测试 logline",
        positioning: "测试定位",
        sellingPoint: "测试卖点",
        coreConflict: "测试冲突",
        protagonistPath: "测试成长",
        endingDirection: "测试结局方向",
        hookStrategy: "测试 hook",
        progressionLoop: "测试推进循环",
        whyItFits: "测试适配原因",
        toneKeywords: ["热血"],
        targetChapterCount: 80,
        titleOptions: [],
      }],
    },
    rawContent: "{}",
  }));

  const result = await service.generateCandidates({
    idea: "普通大学生误入异能组织",
    title: "测试书",
    provider: "openai",
    model: "gpt-5.4",
    workflowTaskId: "task_test",
  });

  assert.equal(runStructuredCount, 1);
  assert.equal(promptJsonCount, 1);
  assert.equal(directCallCount, 1);
  assert.equal(result.batch.candidates.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\directorCandidateFallback.test.js
```

Expected: FAIL because the current candidate stage stops on the first `transport_error`.

- [ ] **Step 3: Write minimal implementation**

Add a director-local fallback helper in `novelDirectorCandidateStage.ts` that:

```ts
// 1. tries runStructuredPrompt
// 2. retries with invokeStructuredLlmDetailed(... structuredStrategy: "prompt_json")
// 3. falls back to direct /chat/completions fetch
// 4. parses with parseStructuredLlmRawContentDetailed
```

Use that helper in:

- `generateBatch(...)`
- candidate patch flow currently starting near the second `runStructuredPrompt(...)`

Do not change unrelated flows.

- [ ] **Step 4: Run test to verify it passes**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\directorCandidateFallback.test.js
```

Expected:

- build exits 0
- test passes

- [ ] **Step 5: Commit**

```powershell
git -C D:\codex\AI-Novel-Writing-Assistant add server/src/services/novel/director/novelDirectorCandidateStage.ts server/tests/directorCandidateFallback.test.js
git -C D:\codex\AI-Novel-Writing-Assistant commit -m "fix: add director candidate structured fallbacks"
```

### Task 3: Regressions And Packaged Runtime Verification

**Files:**
- Modify: `D:/codex/AI-Novel-Writing-Assistant/server/tests/directorCandidateFallback.test.js`
- Verify: `D:/codex/AI-Novel-Writing-Assistant/desktop/build/dist/@ai-noveldesktop-data/logs/desktop-main.log`
- Verify: `D:/codex/AI-Novel-Writing-Assistant/desktop/build/dist/AI Novel Writing Assistant v2-0.3.3-portable-x64.exe`

- [ ] **Step 1: Add the second failing test for candidate patch**

```javascript
test("director candidate stage falls back after transport_error for candidate patch", async (t) => {
  const stageModule = require("../dist/services/novel/director/novelDirectorCandidateStage.js");
  const promptRunner = require("../dist/prompting/core/promptRunner.js");
  const structuredInvoke = require("../dist/llm/structuredInvoke.js");
  const parser = require("../dist/llm/structuredInvokeParser.js");
  const outputSchemaModule = require("../dist/llm/structuredOutput.js");

  const service = new stageModule.NovelDirectorCandidateStageService({
    bootstrapTask: async () => {},
    markTaskRunning: async () => {},
    recordCandidateSelectionRequired: async () => {},
  });

  let runStructuredCount = 0;
  let promptJsonCount = 0;
  let directCallCount = 0;

  t.mock.method(promptRunner, "runStructuredPrompt", async () => {
    runStructuredCount += 1;
    throw new outputSchemaModule.StructuredOutputError("[STRUCTURED_OUTPUT:transport_error] boom", {
      category: "transport_error",
      strategy: "json_schema",
      profile: {
        nativeJsonSchema: true,
        nativeJsonObject: true,
        requiresNonThinkingForStructured: false,
        supportsReasoningToggle: false,
        omitMaxTokensForNativeStructured: false,
        preferredStructuredStrategy: "json_schema",
        safeStructuredMaxTokens: undefined,
        family: "openai",
      },
      fallbackAvailable: false,
      fallbackUsed: false,
    });
  });

  t.mock.method(structuredInvoke, "invokeStructuredLlmDetailed", async () => {
    promptJsonCount += 1;
    throw new outputSchemaModule.StructuredOutputError("[STRUCTURED_OUTPUT:transport_error] boom", {
      category: "transport_error",
      strategy: "prompt_json",
      profile: {
        nativeJsonSchema: true,
        nativeJsonObject: true,
        requiresNonThinkingForStructured: false,
        supportsReasoningToggle: false,
        omitMaxTokensForNativeStructured: false,
        preferredStructuredStrategy: "json_schema",
        safeStructuredMaxTokens: undefined,
        family: "openai",
      },
      fallbackAvailable: false,
      fallbackUsed: false,
    });
  });

  t.mock.method(globalThis, "fetch", async () => {
    directCallCount += 1;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          workingTitle: "修正标题",
          logline: "修正 logline",
          positioning: "修正定位",
          sellingPoint: "修正卖点",
          coreConflict: "修正冲突",
          protagonistPath: "修正成长",
          endingDirection: "修正结局方向",
          hookStrategy: "修正 hook",
          progressionLoop: "修正推进循环",
          whyItFits: "修正适配原因",
          toneKeywords: ["克制"],
          targetChapterCount: 72,
          titleOptions: [],
        }) } }],
      }),
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          workingTitle: "修正标题",
          logline: "修正 logline",
          positioning: "修正定位",
          sellingPoint: "修正卖点",
          coreConflict: "修正冲突",
          protagonistPath: "修正成长",
          endingDirection: "修正结局方向",
          hookStrategy: "修正 hook",
          progressionLoop: "修正推进循环",
          whyItFits: "修正适配原因",
          toneKeywords: ["克制"],
          targetChapterCount: 72,
          titleOptions: [],
        }) } }],
      }),
    };
  });

  t.mock.method(parser, "parseStructuredLlmRawContentDetailed", async () => ({
    output: {
      workingTitle: "修正标题",
      logline: "修正 logline",
      positioning: "修正定位",
      sellingPoint: "修正卖点",
      coreConflict: "修正冲突",
      protagonistPath: "修正成长",
      endingDirection: "修正结局方向",
      hookStrategy: "修正 hook",
      progressionLoop: "修正推进循环",
      whyItFits: "修正适配原因",
      toneKeywords: ["克制"],
      targetChapterCount: 72,
      titleOptions: [],
    },
    rawContent: "{}",
  }));

  const batch = {
    id: "batch_1",
    round: 1,
    roundLabel: "第 1 轮",
    idea: "普通大学生误入异能组织",
    refinementSummary: "初始方案",
    presets: [],
    createdAt: new Date().toISOString(),
    candidates: [{
      id: "candidate_1",
      workingTitle: "旧标题",
      logline: "旧 logline",
      positioning: "旧定位",
      sellingPoint: "旧卖点",
      coreConflict: "旧冲突",
      protagonistPath: "旧成长",
      endingDirection: "旧结局方向",
      hookStrategy: "旧 hook",
      progressionLoop: "旧推进循环",
      whyItFits: "旧适配原因",
      toneKeywords: ["热血"],
      targetChapterCount: 80,
      titleOptions: [],
    }],
  };

  const result = await service.patchCandidate({
    idea: "普通大学生误入异能组织",
    title: "测试书",
    provider: "openai",
    model: "gpt-5.4",
    workflowTaskId: "task_test",
    previousBatches: [batch],
    batchId: "batch_1",
    candidateId: "candidate_1",
    feedback: "保留方向，但调性更克制一些",
    presets: [],
  });

  assert.equal(runStructuredCount, 1);
  assert.equal(promptJsonCount, 1);
  assert.equal(directCallCount, 1);
  assert.equal(result.batch.candidates[0].workingTitle, "修正标题");
});
```

- [ ] **Step 2: Run targeted tests to verify red or green state intentionally**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\directorCandidatePrompt.test.js D:\codex\AI-Novel-Writing-Assistant\server\tests\directorCandidateFallback.test.js D:\codex\AI-Novel-Writing-Assistant\server\tests\directorBookContractFallback.test.js D:\codex\AI-Novel-Writing-Assistant\server\tests\storyMacroFallback.test.js
```

Expected:

- all targeted regression tests pass

- [ ] **Step 3: Rebuild desktop package**

Run:

```powershell
pnpm --filter @ai-novel/server build
AI_NOVEL_STAGE_SKIP_CLEAN=true node D:\codex\AI-Novel-Writing-Assistant\desktop\scripts\stage-desktop.cjs
pnpm -C D:\codex\AI-Novel-Writing-Assistant run dist:desktop:portable:reuse-stage
```

Expected:

- server build exits 0
- stage script exits 0
- portable packaging command exits 0

- [ ] **Step 4: Verify packaged runtime logs after manual repro**

Run after the user reproduces:

```powershell
Get-Content 'D:\codex\AI-Novel-Writing-Assistant\desktop\build\dist\@ai-noveldesktop-data\logs\desktop-main.log' -Tail 200
```

Expected:

- `novel.director.candidates@v1` no longer ends immediately with only `strategy=json_schema` and `fallbackAvailable: false`
- log shows the governed fallback path or a later-stage failure

- [ ] **Step 5: Commit**

```powershell
git -C D:\codex\AI-Novel-Writing-Assistant add server/tests/directorCandidatePrompt.test.js server/tests/directorCandidateFallback.test.js
git -C D:\codex\AI-Novel-Writing-Assistant commit -m "test: cover director candidate structured fallback regressions"
```
