const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createLlmInvocationDiagnostic,
  finishLlmInvocationDiagnostic,
  waitForPendingLlmInvocationDiagnostics,
} = require("../dist/llm/invocationDiagnostics.js");
const { prisma } = require("../dist/db/prisma.js");

function patchPrisma({ createImpl, updateImpl } = {}) {
  const originals = {
    create: prisma.llmInvocationDiagnostic.create,
    update: prisma.llmInvocationDiagnostic.update,
    disable: process.env.LLM_INVOCATION_DIAGNOSTICS_DISABLE_PERSISTENCE,
    backoff: process.env.LLM_INVOCATION_DIAGNOSTICS_RETRY_BACKOFF_MS,
  };
  process.env.LLM_INVOCATION_DIAGNOSTICS_DISABLE_PERSISTENCE = "0";
  process.env.LLM_INVOCATION_DIAGNOSTICS_RETRY_BACKOFF_MS = "0";
  if (createImpl) {
    prisma.llmInvocationDiagnostic.create = createImpl;
  }
  if (updateImpl) {
    prisma.llmInvocationDiagnostic.update = updateImpl;
  }
  return () => {
    prisma.llmInvocationDiagnostic.create = originals.create;
    prisma.llmInvocationDiagnostic.update = originals.update;
    if (originals.disable === undefined) {
      delete process.env.LLM_INVOCATION_DIAGNOSTICS_DISABLE_PERSISTENCE;
    } else {
      process.env.LLM_INVOCATION_DIAGNOSTICS_DISABLE_PERSISTENCE = originals.disable;
    }
    if (originals.backoff === undefined) {
      delete process.env.LLM_INVOCATION_DIAGNOSTICS_RETRY_BACKOFF_MS;
    } else {
      process.env.LLM_INVOCATION_DIAGNOSTICS_RETRY_BACKOFF_MS = originals.backoff;
    }
  };
}

test("createLlmInvocationDiagnostic returns id without waiting for the DB write", async () => {
  let resolvePersist;
  const persistGate = new Promise((resolve) => {
    resolvePersist = resolve;
  });
  const restore = patchPrisma({
    createImpl: async ({ data }) => {
      await persistGate;
      return { id: data.id };
    },
  });

  try {
    const startedAt = Date.now();
    const id = await createLlmInvocationDiagnostic({
      provider: "deepseek",
      model: "deepseek-chat",
      promptMeta: { taskId: "task-fast-return" },
    });
    const elapsedMs = Date.now() - startedAt;

    assert.ok(typeof id === "string" && id.startsWith("llmdiag_"), `expected diagnostic id, got ${id}`);
    assert.ok(elapsedMs < 50, `expected fast return, took ${elapsedMs}ms`);
  } finally {
    resolvePersist();
    await waitForPendingLlmInvocationDiagnostics();
    restore();
  }
});

test("finishLlmInvocationDiagnostic does not block on the DB write", async () => {
  let resolveCreate;
  let resolveUpdate;
  const createGate = new Promise((resolve) => {
    resolveCreate = resolve;
  });
  const updateGate = new Promise((resolve) => {
    resolveUpdate = resolve;
  });
  const restore = patchPrisma({
    createImpl: async ({ data }) => {
      await createGate;
      return { id: data.id };
    },
    updateImpl: async ({ where }) => {
      await updateGate;
      return { id: where.id };
    },
  });

  try {
    const id = await createLlmInvocationDiagnostic({
      provider: "deepseek",
      model: "deepseek-chat",
      promptMeta: { taskId: "task-finish-fast" },
    });

    const startedAt = Date.now();
    await finishLlmInvocationDiagnostic(id, { status: "succeeded", latencyMs: 10, rawChars: 100 });
    const elapsedMs = Date.now() - startedAt;

    assert.ok(elapsedMs < 50, `expected fast finish, took ${elapsedMs}ms`);
  } finally {
    resolveCreate();
    resolveUpdate();
    await waitForPendingLlmInvocationDiagnostics();
    restore();
  }
});

test("persistence errors do not reject the caller and do not surface as unhandled", async () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => {
    warnings.push(args.map((value) => String(value)).join(" "));
  };
  const unhandled = [];
  const rejectionListener = (reason) => {
    unhandled.push(reason);
  };
  process.on("unhandledRejection", rejectionListener);

  const restore = patchPrisma({
    createImpl: async () => {
      throw new Error("simulated upstream failure");
    },
    updateImpl: async () => {
      throw new Error("simulated update failure");
    },
  });

  try {
    const id = await createLlmInvocationDiagnostic({
      provider: "deepseek",
      model: "deepseek-chat",
      promptMeta: { taskId: "task-error-swallowed" },
    });
    assert.ok(id.startsWith("llmdiag_"));

    await finishLlmInvocationDiagnostic(id, { status: "failed", errorMessage: "boom" });

    await waitForPendingLlmInvocationDiagnostics();

    assert.ok(
      warnings.some((line) => /action=create/.test(line) && /simulated upstream failure/.test(line)),
      `expected create warning, got ${JSON.stringify(warnings)}`,
    );
    assert.ok(
      warnings.some((line) => /action=finish/.test(line) && /simulated update failure/.test(line)),
      `expected finish warning, got ${JSON.stringify(warnings)}`,
    );
    assert.equal(unhandled.length, 0, `expected no unhandled rejections, got ${unhandled.length}`);
  } finally {
    process.off("unhandledRejection", rejectionListener);
    console.warn = originalWarn;
    await waitForPendingLlmInvocationDiagnostics();
    restore();
  }
});

test("diagnostic data still reaches prisma after fire-and-forget flush", async () => {
  const createCalls = [];
  const updateCalls = [];
  const restore = patchPrisma({
    createImpl: async ({ data }) => {
      createCalls.push(data);
      return { id: data.id };
    },
    updateImpl: async ({ where, data }) => {
      updateCalls.push({ id: where.id, ...data });
      return { id: where.id };
    },
  });

  try {
    const id = await createLlmInvocationDiagnostic({
      provider: "deepseek",
      model: "deepseek-v4-pro",
      baseURL: "https://api.example.com/v1",
      requestProtocol: "openai_compatible",
      strategy: "json_object",
      estimatedInputTokens: 321,
      renderedPromptChars: 1500,
      messageChars: 1600,
      promptMeta: {
        taskId: "task-persisted",
        novelId: "novel-1",
        promptId: "novel.story_macro.decomposition",
        promptVersion: "h1234567890ab",
        stage: "story_macro",
        itemKey: "book_contract",
      },
    });
    await finishLlmInvocationDiagnostic(id, {
      status: "succeeded",
      latencyMs: 42,
      rawChars: 512,
    });

    await waitForPendingLlmInvocationDiagnostics();

    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].id, id);
    assert.equal(createCalls[0].taskId, "task-persisted");
    assert.equal(createCalls[0].provider, "deepseek");
    assert.equal(createCalls[0].model, "deepseek-v4-pro");
    assert.equal(createCalls[0].status, "started");
    assert.equal(createCalls[0].estimatedInputTokens, 321);
    assert.equal(createCalls[0].promptVersion, "h1234567890ab");

    assert.equal(updateCalls.length, 1);
    assert.equal(updateCalls[0].id, id);
    assert.equal(updateCalls[0].status, "succeeded");
    assert.equal(updateCalls[0].latencyMs, 42);
    assert.equal(updateCalls[0].rawChars, 512);
  } finally {
    await waitForPendingLlmInvocationDiagnostics();
    restore();
  }
});
