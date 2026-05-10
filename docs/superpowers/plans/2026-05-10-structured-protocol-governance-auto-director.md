# Structured Protocol Governance For Auto-Director Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate protocol and transport fragility across auto-director structured prompts by enforcing provider-family/protocol consistency at the route layer, introducing shared structured timeout and transport resilience, and only then trimming duplicated service-local fallbacks.

**Architecture:** Treat the current failures as a governance problem, not a single prompt bug. First constrain model-route persistence and resolution so OpenAI-compatible providers cannot silently inherit Anthropic transport. Then add shared structured timeout and transport fallback behavior in the structured invocation layer so planner prompts fail fast and degrade consistently. Only after those shared guarantees are proven should director-local fallback helpers be reduced.

**Tech Stack:** TypeScript, Node.js, Prisma/SQLite-backed route config, LangChain/OpenAI integration, custom Anthropic transport adapter, raw fetch fallback, Node test runner, Electron portable packaging.

---

### Task 1: Enforce Provider-Family And Protocol Consistency In Model Routes

**Files:**
- Modify: `D:/codex/AI-Novel-Writing-Assistant/server/src/llm/modelRouter.ts`
- Modify: `D:/codex/AI-Novel-Writing-Assistant/server/src/routes/llm.ts`
- Test: `D:/codex/AI-Novel-Writing-Assistant/server/tests/modelRouter.test.js`
- Test: `D:/codex/AI-Novel-Writing-Assistant/server/tests/routes.test.js`

- [ ] **Step 1: Write the failing model-router test for OpenAI-compatible provider families**

Add this test to `server/tests/modelRouter.test.js`:

```javascript
test("resolveModel normalizes openai-compatible providers away from anthropic protocol", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;

  prisma.modelRouteConfig.findUnique = async () => ({
    taskType: "planner",
    provider: "openai",
    model: "gpt-5.4",
    temperature: 0.7,
    maxTokens: null,
    requestProtocol: "anthropic",
    structuredResponseFormat: "prompt_json",
  });

  try {
    const resolved = await resolveModel("planner");
    assert.equal(resolved.provider, "openai");
    assert.equal(resolved.requestProtocol, "openai_compatible");
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});
```

- [ ] **Step 2: Add the failing custom-provider family test**

Add this second test to the same file:

```javascript
test("resolveModel normalizes custom openai-compatible providers away from anthropic protocol", async () => {
  const originalFindUnique = prisma.modelRouteConfig.findUnique;

  prisma.modelRouteConfig.findUnique = async () => ({
    taskType: "planner",
    provider: "custom-openai-like",
    model: "gpt-5.4",
    temperature: 0.7,
    maxTokens: null,
    requestProtocol: "anthropic",
    structuredResponseFormat: "prompt_json",
  });

  try {
    const resolved = await resolveModel("planner");
    assert.equal(resolved.provider, "custom-openai-like");
    assert.equal(resolved.requestProtocol, "openai_compatible");
  } finally {
    prisma.modelRouteConfig.findUnique = originalFindUnique;
  }
});
```

- [ ] **Step 3: Run model-router test to verify it fails**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\modelRouter.test.js
```

Expected: FAIL because `resolveModel()` currently preserves `requestProtocol === "anthropic"` for OpenAI-compatible provider families.

- [ ] **Step 4: Write the failing route API test for rejecting invalid updates**

Add this case to `server/tests/routes.test.js`:

```javascript
test("PUT /api/llm/model-routes rejects openai-compatible provider with anthropic protocol", async () => {
  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/llm/model-routes`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        taskType: "planner",
        provider: "openai",
        model: "gpt-5.4",
        temperature: 0.7,
        requestProtocol: "anthropic",
        structuredResponseFormat: "prompt_json",
      }),
    });

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.success, false);
    assert.match(payload.message, /协议|protocol|openai/i);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
```

- [ ] **Step 5: Run route test to verify it fails**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\routes.test.js
```

Expected: FAIL because the current route accepts invalid provider/protocol combinations.

- [ ] **Step 6: Implement provider-family consistency rules**

Update `server/src/llm/modelRouter.ts` to normalize by provider family, not by one-off provider name:

```ts
function shouldUseAnthropicProtocol(provider: LLMProvider): boolean {
  return provider === "anthropic";
}

function normalizeRoutePreferencesForProvider(input: {
  provider: LLMProvider;
  requestProtocol?: string | null;
  structuredResponseFormat?: string | null;
}): {
  requestProtocol: ModelRouteRequestProtocol;
  structuredResponseFormat: ModelRouteStructuredResponseFormat;
} {
  const normalizedProtocol = normalizeRequestProtocol(input.requestProtocol);
  const requestProtocol = shouldUseAnthropicProtocol(input.provider)
    ? (normalizedProtocol === "anthropic" ? "anthropic" : "auto")
    : (normalizedProtocol === "anthropic" ? "openai_compatible" : normalizedProtocol);

  const structuredResponseFormat = requestProtocol === "anthropic"
    ? "prompt_json"
    : normalizeStructuredResponseFormat(input.structuredResponseFormat);

  return {
    requestProtocol,
    structuredResponseFormat,
  };
}
```

Then replace all existing `normalizeRoutePreferences(...)` calls with the provider-aware helper.

In `server/src/routes/llm.ts`, reject invalid write combinations:

```ts
if (body.requestProtocol === "anthropic" && body.provider !== "anthropic") {
  throw new AppError("只有 Anthropic provider 可以保存为 anthropic 请求协议。", 400);
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\modelRouter.test.js
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\routes.test.js
```

Expected:
- build exits 0
- both tests pass

- [ ] **Step 8: Commit**

```powershell
git -C D:\codex\AI-Novel-Writing-Assistant add server/src/llm/modelRouter.ts server/src/routes/llm.ts server/tests/modelRouter.test.js server/tests/routes.test.js
git -C D:\codex\AI-Novel-Writing-Assistant commit -m "fix: enforce provider family protocol consistency for model routes"
```

### Task 2: Add Shared Structured Timeout Governance Before Fallback

**Files:**
- Modify: `D:/codex/AI-Novel-Writing-Assistant/server/src/llm/structuredInvoke.ts`
- Modify: `D:/codex/AI-Novel-Writing-Assistant/server/src/llm/invokeTimeout.ts`
- Test: `D:/codex/AI-Novel-Writing-Assistant/server/tests/structuredInvoke.test.js`

- [ ] **Step 1: Write the failing timeout-governance test**

Add this test to `server/tests/structuredInvoke.test.js`:

```javascript
test("invokeStructuredLlmDetailed converts long prompt_json hangs into transport failure on the enforced timeout boundary", async () => {
  const originalResolve = factory.resolveLLMClientOptions;
  const originalCreate = factory.createLLMFromResolvedOptions;

  factory.resolveLLMClientOptions = async () => buildRepairResolvedOptions("openai", {
    model: "gpt-5.4",
    baseURL: "https://example.invalid/v1",
    executionMode: "structured",
    structuredStrategy: "prompt_json",
    requestProtocol: "openai_compatible",
    taskType: "planner",
    timeoutMs: 50,
  });

  factory.createLLMFromResolvedOptions = () => ({
    invoke: async () => new Promise(() => {}),
  });

  try {
    await assert.rejects(() => structuredInvoke.invokeStructuredLlmDetailed({
      schema: z.object({ value: z.string() }),
      provider: "openai",
      model: "gpt-5.4",
      taskType: "planner",
      structuredStrategy: "prompt_json",
      requestProtocol: "openai_compatible",
      timeoutMs: 50,
      label: "structured.invoke.timeout.boundary",
      messages: [{ type: "human", content: "只输出 JSON" }],
    }), /transport_error|timed out/i);
  } finally {
    factory.resolveLLMClientOptions = originalResolve;
    factory.createLLMFromResolvedOptions = originalCreate;
  }
});
```

- [ ] **Step 2: Run the timeout test to verify it fails or hangs under current behavior**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\structuredInvoke.test.js
```

Expected: FAIL or hang because current governance does not explicitly codify a fast-fail structured timeout policy for this scenario.

- [ ] **Step 3: Implement explicit structured timeout governance**

In `server/src/llm/structuredInvoke.ts`, add a helper that resolves the effective timeout for structured calls:

```ts
function resolveStructuredAttemptTimeout(input: {
  explicitTimeoutMs?: number;
  strategy: StructuredOutputStrategy;
  requestProtocol: ModelRouteRequestProtocol;
}): number | undefined {
  if (typeof input.explicitTimeoutMs === "number") {
    return input.explicitTimeoutMs;
  }
  if (input.requestProtocol === "openai_compatible" && input.strategy === "prompt_json") {
    return 45000;
  }
  return undefined;
}
```

Use that resolved timeout when calling `runWithEnforcedTimeout(...)` for structured attempts. Do not change unrelated plain invocations.

- [ ] **Step 4: Run the timeout test to verify it passes**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\structuredInvoke.test.js
```

Expected: timeout test passes and no existing structured invoke tests regress.

- [ ] **Step 5: Commit**

```powershell
git -C D:\codex\AI-Novel-Writing-Assistant add server/src/llm/structuredInvoke.ts server/src/llm/invokeTimeout.ts server/tests/structuredInvoke.test.js
git -C D:\codex\AI-Novel-Writing-Assistant commit -m "fix: add shared structured timeout governance"
```

### Task 3: Make Structured Invoke Own OpenAI-Compatible Transport Resilience

**Files:**
- Modify: `D:/codex/AI-Novel-Writing-Assistant/server/src/llm/structuredInvoke.ts`
- Modify: `D:/codex/AI-Novel-Writing-Assistant/server/src/llm/structuredInvokeParser.ts`
- Test: `D:/codex/AI-Novel-Writing-Assistant/server/tests/structuredInvoke.test.js`

- [ ] **Step 1: Write the failing shared transport fallback test**

Add this test to `server/tests/structuredInvoke.test.js`:

```javascript
test("invokeStructuredLlmDetailed falls back to direct openai-compatible transport after prompt_json transport_error", async () => {
  const originalResolve = factory.resolveLLMClientOptions;
  const originalCreate = factory.createLLMFromResolvedOptions;
  const originalFetch = global.fetch;

  let invokeCount = 0;
  let fetchCount = 0;

  factory.resolveLLMClientOptions = async () => buildRepairResolvedOptions("openai", {
    model: "gpt-5.4",
    baseURL: "https://example.invalid/v1",
    executionMode: "structured",
    structuredStrategy: "prompt_json",
    requestProtocol: "openai_compatible",
    taskType: "planner",
  });

  factory.createLLMFromResolvedOptions = () => ({
    invoke: async () => {
      invokeCount += 1;
      throw new Error("fetch failed");
    },
  });

  global.fetch = async () => {
    fetchCount += 1;
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({ value: "direct-fallback-ok" }),
        },
      }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await structuredInvoke.invokeStructuredLlmDetailed({
      schema: z.object({ value: z.string() }),
      provider: "openai",
      model: "gpt-5.4",
      taskType: "planner",
      structuredStrategy: "prompt_json",
      requestProtocol: "openai_compatible",
      label: "structured.invoke.transport.fallback",
      messages: [{ type: "human", content: "只输出 JSON" }],
    });

    assert.equal(invokeCount, 1);
    assert.equal(fetchCount, 1);
    assert.deepEqual(result.data, { value: "direct-fallback-ok" });
  } finally {
    factory.resolveLLMClientOptions = originalResolve;
    factory.createLLMFromResolvedOptions = originalCreate;
    global.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Add the failing regression test that Anthropic protocol does not use OpenAI direct fallback**

```javascript
test("invokeStructuredLlmDetailed does not use direct openai-compatible fallback for anthropic protocol", async () => {
  const originalResolve = factory.resolveLLMClientOptions;
  const originalCreate = factory.createLLMFromResolvedOptions;
  const originalFetch = global.fetch;

  factory.resolveLLMClientOptions = async () => buildRepairResolvedOptions("anthropic", {
    model: "claude-sonnet-4-5",
    baseURL: "https://example.invalid/v1",
    executionMode: "structured",
    structuredStrategy: "prompt_json",
    requestProtocol: "anthropic",
    taskType: "planner",
  });

  factory.createLLMFromResolvedOptions = () => ({
    invoke: async () => {
      throw new Error("fetch failed");
    },
  });

  let fetchCount = 0;
  global.fetch = async () => {
    fetchCount += 1;
    throw new Error("should not call direct openai fallback");
  };

  try {
    await assert.rejects(() => structuredInvoke.invokeStructuredLlmDetailed({
      schema: z.object({ value: z.string() }),
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      taskType: "planner",
      structuredStrategy: "prompt_json",
      requestProtocol: "anthropic",
      label: "structured.invoke.transport.no-openai-fallback",
      messages: [{ type: "human", content: "只输出 JSON" }],
    }), /transport_error|fetch failed/i);
    assert.equal(fetchCount, 0);
  } finally {
    factory.resolveLLMClientOptions = originalResolve;
    factory.createLLMFromResolvedOptions = originalCreate;
    global.fetch = originalFetch;
  }
});
```

- [ ] **Step 3: Run the transport tests to verify they fail**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\structuredInvoke.test.js
```

Expected: FAIL because shared `invokeStructuredLlmDetailed()` currently stops on `transport_error` and never issues a direct `/chat/completions` fallback.

- [ ] **Step 4: Implement the minimal shared fallback path**

Add a shared helper in `server/src/llm/structuredInvoke.ts` for the narrow case:

```ts
// only for openai-compatible prompt_json structured calls
// only after transport_error from invoke path
// perform direct POST /chat/completions
// then parse with parseStructuredLlmRawContentDetailed
```

Guardrails:
- only run when `requestProtocol === "openai_compatible"`
- only run for `strategy === "prompt_json"`
- do not trigger for Anthropic protocol
- preserve existing repair parsing behavior after raw text comes back

The helper must return a normal `StructuredInvokeResult<T>` so service code does not need to know whether direct fallback happened.

- [ ] **Step 5: Run structured invoke tests to verify they pass**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\structuredInvoke.test.js
```

Expected:
- build exits 0
- timeout and transport fallback tests pass
- no existing structured invoke tests regress

- [ ] **Step 6: Commit**

```powershell
git -C D:\codex\AI-Novel-Writing-Assistant add server/src/llm/structuredInvoke.ts server/src/llm/structuredInvokeParser.ts server/tests/structuredInvoke.test.js
git -C D:\codex\AI-Novel-Writing-Assistant commit -m "fix: centralize structured transport fallback for openai compatible prompts"
```

### Task 4: Add A Real Character-Cast Regression On Shared Transport Governance

**Files:**
- Modify: `D:/codex/AI-Novel-Writing-Assistant/server/src/services/novel/characterPrep/characterCastGeneration.ts`
- Test: `D:/codex/AI-Novel-Writing-Assistant/server/tests/characterCastAutoTransport.test.js`

- [ ] **Step 1: Write the failing end-to-end service regression**

Create `server/tests/characterCastAutoTransport.test.js` with this test:

```javascript
const test = require("node:test");
const assert = require("node:assert/strict");

const prismaModulePath = require.resolve("../dist/db/prisma.js");
require.cache[prismaModulePath] = {
  id: prismaModulePath,
  filename: prismaModulePath,
  loaded: true,
  exports: {
    prisma: {
      novel: {
        findUnique: async () => ({
          id: "novel-1",
          title: "规则快递",
          description: "底层跑腿员被卷入看不见的都市规则网络。",
          styleTone: null,
          narrativePov: "third_person",
          pacePreference: "balanced",
          emotionIntensity: "medium",
          genre: { name: "都市异能" },
          world: null,
          bible: {
            coreSetting: null,
            mainPromise: null,
            characterArcs: null,
            worldRules: null,
          },
          storyMacroPlan: {
            storyInput: "一个底层跑腿员发现城市地下存在会吞人的隐形规则系统。",
            decompositionJson: null,
            constraintEngineJson: null,
          },
          bookContract: null,
          primaryStoryMode: null,
          secondaryStoryMode: null,
          characters: [],
        }),
      },
    },
  },
};

const promptRunner = require("../dist/prompting/core/promptRunner.js");
const structuredOutput = require("../dist/llm/structuredOutput.js");
const service = require("../dist/services/novel/characterPrep/characterCastGeneration.js");

function transportError() {
  return new structuredOutput.StructuredOutputError("[STRUCTURED_OUTPUT:transport_error] fetch failed", {
    category: "transport_error",
    strategy: "prompt_json",
    profile: {
      nativeJsonSchema: false,
      nativeJsonObject: false,
      requiresNonThinkingForStructured: false,
      supportsReasoningToggle: false,
      omitMaxTokensForNativeStructured: false,
      preferredStructuredStrategy: "prompt_json",
      safeStructuredMaxTokens: 8192,
      family: "custom_openai_compatible",
    },
    fallbackAvailable: false,
    fallbackUsed: false,
  });
}

test("generateAutoCharacterCastDraft survives first transport failure via shared structured fallback", async () => {
  const originalInvoker = promptRunner.runStructuredPrompt;
  let callCount = 0;

  promptRunner.runStructuredPrompt = async ({ asset }) => {
    callCount += 1;
    if (asset.id === "novel.character.castAuto") {
      if (callCount === 1) {
        throw transportError();
      }
      return {
        output: {
          option: {
            title: "规则快递角色阵容",
            summary: "都市底层规则阵容",
            whyItWorks: "角色关系能持续制造规则压迫与反压。",
            recommendedReason: "适合自动导演直接推进。",
            members: [
              {
                name: "林骁",
                role: "跑腿员",
                gender: "male",
                castRole: "protagonist",
                relationToProtagonist: "本人",
                storyFunction: "规则受害者兼反压发起者",
                shortDescription: "在城市缝隙里讨生活的底层跑腿员。",
                outerGoal: "活下来并摆脱规则压迫",
                innerNeed: "不再把自己当成随时可牺牲的人",
                fear: "被规则吞掉还没人记得",
                wound: "长期被高位者当工具消耗",
                misbelief: "只要低头就能换来安全",
                secret: "已经偷偷记录异常规则样本",
                moralLine: "不拿无辜人试规则",
                firstImpression: "沉默、谨慎、手快",
              },
              {
                name: "周岚",
                role: "站点调度",
                gender: "female",
                castRole: "ally",
                relationToProtagonist: "站点同事",
                storyFunction: "现实压力与规则信息的连接点",
                shortDescription: "比主角更懂城市运转规则的调度员。",
                outerGoal: "保住站点和自己的人",
                innerNeed: "停止对压迫视而不见",
                fear: "卷进高位规则后连退路都没有",
                wound: "曾经失去过一个同事",
                misbelief: "知道太多只会死得更快",
                secret: "她掌握一份旧城区异常线路表",
                moralLine: "不卖自己人",
                firstImpression: "利落、冷静、会算账",
              },
              {
                name: "顾承业",
                role: "区域承包人",
                gender: "male",
                castRole: "pressure_source",
                relationToProtagonist: "上层盘剥者",
                storyFunction: "把都市现实压迫具象化",
                shortDescription: "靠站点与线路抽成吃底层的承包人。",
                outerGoal: "继续垄断异常线路收益",
                innerNeed: "保住自己向上输送利益的位置",
                fear: "规则失控反咬到自己",
                wound: "早年靠出卖同伴上位",
                misbelief: "底层永远只配被调度",
                secret: "他私下和更高层节点做过交易",
                moralLine: "不允许别人碰他的利益链",
                firstImpression: "笑着说话，句句逼债",
              },
            ],
            relations: [
              {
                sourceName: "林骁",
                targetName: "周岚",
                surfaceRelation: "同事互帮",
                hiddenTension: "周岚怕主角查太深把两人都拖下水",
                conflictSource: "要不要继续追异常线路",
                secretAsymmetry: "周岚知道更多旧线路信息",
                dynamicLabel: "现实同盟",
                nextTurnPoint: "主角发现周岚隐瞒了一张线路表",
              },
              {
                sourceName: "林骁",
                targetName: "顾承业",
                surfaceRelation: "雇佣与被雇佣",
                hiddenTension: "顾承业已经把主角当成可消耗棋子",
                conflictSource: "异常夜单的代价分配",
                secretAsymmetry: "顾承业知道规则代价会转嫁给谁",
                dynamicLabel: "压迫对抗",
                nextTurnPoint: "主角第一次拿规则反卡顾承业",
              },
            ],
          },
        },
      };
    }
    throw new Error(`unexpected prompt ${asset.id}`);
  };

  try {
    const result = await service.generateAutoCharacterCastDraft("novel-1", {
      provider: "openai",
      model: "gpt-5.4",
      temperature: 0.5,
    });

    assert.equal(result.parsed.option.title, "规则快递角色阵容");
    assert.equal(result.parsed.option.members.length, 3);
  } finally {
    promptRunner.runStructuredPrompt = originalInvoker;
  }
});
```

- [ ] **Step 2: Run the new test to verify it fails under the current plan state**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\characterCastAutoTransport.test.js
```

Expected: FAIL until shared transport fallback from Task 3 is in place and the service no longer depends on route-level protocol accidents.

- [ ] **Step 3: Minimize local fallback to content-quality concerns only**

After Task 3 lands, keep `generateAutoCharacterCastDraft()` focused on content fallback only:

```ts
// staged fallback remains for malformed/schema-quality outputs
// transport resilience is now owned by shared structured invocation
```

Do not add `transport_error` to `shouldFallbackToStagedAutoCast()`.

- [ ] **Step 4: Run the character-cast regression and shared invoke tests**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\characterCastAutoTransport.test.js
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\structuredInvoke.test.js
```

Expected:
- build exits 0
- character-cast transport regression passes
- structured invoke timeout/fallback tests still pass

- [ ] **Step 5: Commit**

```powershell
git -C D:\codex\AI-Novel-Writing-Assistant add server/src/services/novel/characterPrep/characterCastGeneration.ts server/tests/characterCastAutoTransport.test.js server/tests/structuredInvoke.test.js
git -C D:\codex\AI-Novel-Writing-Assistant commit -m "refactor: keep character cast fallback focused on content repair"
```

### Task 5: Verify Shared Governance Before Trimming Director-Local Special Cases

**Files:**
- Modify: `D:/codex/AI-Novel-Writing-Assistant/server/src/services/novel/director/novelDirectorCandidateStage.ts`
- Modify: `D:/codex/AI-Novel-Writing-Assistant/server/src/services/novel/director/novelDirectorStoryMacroPhase.ts`
- Test: `D:/codex/AI-Novel-Writing-Assistant/server/tests/directorCandidateFallback.test.js`
- Test: `D:/codex/AI-Novel-Writing-Assistant/server/tests/directorBookContractFallback.test.js`

- [ ] **Step 1: Add a regression that preserves current packaged-runtime-visible director behavior**

Update the existing director fallback tests so they assert outcome stability, not internal helper counts:

```javascript
assert.ok(fetchCalls >= 1);
assert.equal(result.batch.candidates.length, 2);
assert.equal(result.batch.candidates[0].workingTitle, "地铁规则快递员");
```

and

```javascript
assert.ok(fetchCalls >= 1);
assert.equal(persistedDraft.readingPromise, "持续兑现规则压迫下的反压快感。");
```

Do not assert implementation-specific fallback counters in this task.

- [ ] **Step 2: Run director fallback tests to establish the protected baseline**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\directorCandidateFallback.test.js
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\directorBookContractFallback.test.js
```

Expected: both tests pass and encode the behavior we must preserve.

- [ ] **Step 3: Narrow duplicated local fallback only if the shared layer demonstrably covers the same path**

Rules:
- keep service-local logic if it still owns explicit protocol override or prompt-family-specific direct parsing
- remove duplicated “first transport_error => invokeStructuredLlmDetailed(prompt_json)” code only where Task 3 makes it redundant
- preserve any final direct-call hop that remains necessary for packaged-runtime parity

- [ ] **Step 4: Run director regression suite**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\directorCandidateFallback.test.js
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\directorBookContractFallback.test.js
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\directorCandidatePrompt.test.js
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\directorBookContractPrompt.test.js
```

Expected: all four tests pass with no regression in director behavior.

- [ ] **Step 5: Commit**

```powershell
git -C D:\codex\AI-Novel-Writing-Assistant add server/src/services/novel/director/novelDirectorCandidateStage.ts server/src/services/novel/director/novelDirectorStoryMacroPhase.ts server/tests/directorCandidateFallback.test.js server/tests/directorBookContractFallback.test.js server/tests/directorCandidatePrompt.test.js server/tests/directorBookContractPrompt.test.js
git -C D:\codex\AI-Novel-Writing-Assistant commit -m "refactor: align director fallback helpers with shared structured governance"
```

### Task 6: Fresh Packaged Runtime Verification Against The Real Auto-Director Flow

**Files:**
- Modify: `D:/codex/AI-Novel-Writing-Assistant/docs/superpowers/specs/2026-05-10-director-structured-fallback-governance-design.md`
- Modify: `D:/codex/AI-Novel-Writing-Assistant/docs/superpowers/plans/2026-05-10-structured-protocol-governance-auto-director.md`

- [ ] **Step 1: Build the server and targeted test suite**

Run:

```powershell
pnpm --filter @ai-novel/server build
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\modelRouter.test.js
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\routes.test.js
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\structuredInvoke.test.js
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\characterCastAutoTransport.test.js
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\directorCandidateFallback.test.js
node --test D:\codex\AI-Novel-Writing-Assistant\server\tests\directorBookContractFallback.test.js
```

Expected: all commands exit 0.

- [ ] **Step 2: Rebuild / restage the desktop runtime**

Run the same desktop packaging flow already proven in this repo for fresh runtime verification. Record the exact commands used in the plan notes after execution.

Minimum expected outcome:
- fresh `app.asar` contains the new server build
- packaged runtime starts successfully

- [ ] **Step 3: Verify runtime route state, not just in-memory normalization**

Run:

```powershell
Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:<port>/api/llm/model-routes'
```

Expected for `planner`:
- `provider: openai`
- `requestProtocol: openai_compatible`

Also record whether historical bad DB rows were rejected at write time or normalized at read time.

- [ ] **Step 4: Run fresh auto-director and inspect packaged logs**

Use the real packaged desktop flow to start auto-director again, then inspect:

```powershell
Get-Content 'C:\Users\w2450\AppData\Local\AI-Novel-Writing-Assistant-v2\logs\desktop-main.log' -Tail 400
```

Expected:
- no `family: 'anthropic'` for `provider=openai` planner structured calls
- no immediate `transport_error` at `novel.character.castAuto@v1` caused by wrong protocol inheritance
- if upstream transport still fails, the failure happens earlier on the governed timeout boundary and then visibly enters the shared fallback path

- [ ] **Step 5: Update design and plan notes with fresh evidence**

Add a short verification note to:
- `docs/superpowers/specs/2026-05-10-director-structured-fallback-governance-design.md`
- `docs/superpowers/plans/2026-05-10-structured-protocol-governance-auto-director.md`

Template:

```md
## Fresh Verification Notes

- Runtime route check confirmed planner requestProtocol = openai_compatible.
- Shared structured timeout boundary changed first-failure timing from ~125s to <configured timeout>.
- Packaged auto-director advanced through <stage list>.
- Latest packaged error changed from <old text> to <new text>, or the run completed past character setup.
```

- [ ] **Step 6: Commit**

```powershell
git -C D:\codex\AI-Novel-Writing-Assistant add docs/superpowers/specs/2026-05-10-director-structured-fallback-governance-design.md docs/superpowers/plans/2026-05-10-structured-protocol-governance-auto-director.md
  git -C D:\codex\AI-Novel-Writing-Assistant commit -m "docs: record structured protocol governance verification"
  ```

## Fresh Verification Notes

- Runtime route check on fresh desktop server `127.0.0.1:54333` confirmed `planner.requestProtocol = openai_compatible` and `structuredResponseFormat = prompt_json`.
- Fresh `win-unpacked` verification used `pnpm run verify:desktop-package`, which restaged the desktop app, rebuilt native modules, and regenerated `desktop/build/dist/win-unpacked`.
- On the resumed real packaged task `cmoza02n1000e9cetoj3t2i2b`, `novel.character.castAuto@v1` no longer failed at the former first transport layer. The run progressed through `character.castAuto`, `character.castAuto.repair`, `character_setup`, `character_cast_apply`, and into `volume_strategy` / `volume_skeleton`.
- The latest packaged-runtime behavior therefore moved from `character_setup -> [STRUCTURED_OUTPUT:transport_error] fetch failed` to a later live frontier in `volume_strategy`, which becomes the next runtime observation target.
