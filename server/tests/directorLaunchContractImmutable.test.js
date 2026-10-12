const test = require("node:test");
const assert = require("node:assert/strict");

const Module = require("node:module");
const originalLoad = Module._load;
let DirectorTaskStateWriter;
let NovelWorkflowService;
try {
  // Keep real workflow merging, but never initialize Prisma for memory fixtures.
  Module._load = function (request, parent, isMain) {
    if (/[\\/]db[\\/]prisma(?:\.js)?$/.test(request)) return { prisma: {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  ({ DirectorTaskStateWriter } = require("../dist/services/novel/director/state/index.js"));
  ({ NovelWorkflowService } = require("../dist/services/novel/workflow/NovelWorkflowService.js"));
} finally {
  Module._load = originalLoad;
}

function createWorkflow(seedPayload) {
  const bootstrapCalls = [];
  return {
    bootstrapCalls,
    async getTaskById() {
      return {
        id: "task-existing",
        lane: "auto_director",
        seedPayloadJson: JSON.stringify(seedPayload),
      };
    },
    async bootstrapTask(input) {
      bootstrapCalls.push(input);
      return input;
    },
  };
}

function stateFor(idea, phase) {
  return {
    launch: {
      directorInput: { idea, runMode: "auto_to_ready" },
      runMode: "auto_to_ready",
      provider: "openai",
      model: "gpt-launch",
      temperature: 0.2,
      legacyContext: { campaignId: idea },
    },
    run: { directorSession: { phase } },
  };
}

test("ordinary task initialization rejects changes to the created launch contract", async () => {
  const workflow = createWorkflow({
    directorInput: { idea: "原始创意", runMode: "auto_to_ready" },
    runMode: "auto_to_ready",
    provider: "openai",
    model: "gpt-launch",
    temperature: 0.2,
  });
  const writer = new DirectorTaskStateWriter(workflow);

  await assert.rejects(
    writer.initializeTask({
      workflowTaskId: "task-existing",
      lane: "auto_director",
      title: "新任务",
      directorState: stateFor("改写后的创意", "story_macro"),
    }),
    /launch contract/i,
  );
  assert.equal(workflow.bootstrapCalls.length, 0);
});

test("unbound candidate first finalization fills absent launch fields without changing populated ones", async () => {
  let persisted = {
    runMode: "auto_to_execution",
    idea: "候选阶段的原始创意",
  };
  const workflow = {
    bootstrapCalls: [],
    async getTaskById() {
      return {
        id: "task-existing",
        lane: "auto_director",
        novelId: null,
        seedPayloadJson: JSON.stringify(persisted),
      };
    },
    async bootstrapTask(input) {
      this.bootstrapCalls.push(input);
      persisted = input.seedPayload;
      return input;
    },
  };
  const writer = new DirectorTaskStateWriter(workflow);

  await writer.initializeTask({
    workflowTaskId: "task-existing",
    lane: "auto_director",
    title: "确认后的任务",
    directorState: {
      launch: {
        directorInput: { idea: "候选阶段的原始创意", runMode: "auto_to_execution" },
        runMode: "auto_to_execution",
        provider: "openai",
        legacyContext: { idea: "候选阶段的原始创意" },
      },
      run: { directorSession: { phase: "candidate_selection" } },
    },
  });

  assert.equal(workflow.bootstrapCalls.length, 1);
  assert.equal(persisted.directorInput.idea, "候选阶段的原始创意");
  assert.equal(persisted.runMode, "auto_to_execution");
  assert.equal(persisted.provider, "openai");

  await assert.rejects(
    writer.initializeTask({
      workflowTaskId: "task-existing",
      lane: "auto_director",
      title: "不能改写既有模式",
      directorState: {
        launch: {
          directorInput: { idea: "候选阶段的原始创意", runMode: "auto_to_execution" },
          runMode: "full_book_autopilot",
          legacyContext: { idea: "候选阶段的原始创意" },
        },
        run: { directorSession: { phase: "candidate_selection" } },
      },
    }),
    /launch contract/i,
  );
  assert.equal(workflow.bootstrapCalls.length, 1);
});

test("candidate confirmation cannot replace a launch contract after the task is attached to a novel", async () => {
  const workflow = {
    bootstrapCalls: [],
    async getTaskById() {
      return {
        id: "task-existing",
        novelId: "novel-existing",
        lane: "auto_director",
        seedPayloadJson: JSON.stringify({ runMode: "auto_to_execution" }),
      };
    },
    async bootstrapTask(input) {
      this.bootstrapCalls.push(input);
      return input;
    },
  };
  const writer = new DirectorTaskStateWriter(workflow);

  await assert.rejects(
    writer.initializeTask({
      workflowTaskId: "task-existing",
      novelId: "novel-existing",
      lane: "auto_director",
      title: "已关联的任务",
      directorState: {
        launch: { runMode: "full_book_autopilot", legacyContext: {} },
        run: {},
      },
    }, { replaceLaunchContract: "candidate_confirmation" }),
    /launch contract/i,
  );
  assert.equal(workflow.bootstrapCalls.length, 0);
});

test("takeover replacement writes a whole new launch contract", async () => {
  const workflow = createWorkflow({
    directorInput: { idea: "旧创意", runMode: "auto_to_ready" },
    runMode: "auto_to_ready",
    provider: "openai",
    model: "gpt-old",
    temperature: 0.5,
    directorSession: { phase: "chapter_execution" },
  });
  const writer = new DirectorTaskStateWriter(workflow);

  await writer.initializeTask({
    workflowTaskId: "task-existing",
    lane: "auto_director",
    title: "接管后的任务",
    directorState: stateFor("接管创意", "story_macro"),
  }, { replaceLaunchContract: "takeover" });

  assert.equal(workflow.bootstrapCalls.length, 1);
  const persisted = workflow.bootstrapCalls[0].seedPayload;
  assert.equal(persisted.directorInput.idea, "接管创意");
  assert.equal(persisted.model, "gpt-launch");
  assert.equal(persisted.campaignId, "接管创意");
  assert.deepEqual(persisted.directorSession, { phase: "story_macro" });
});

test("bound novel initialization cannot fill an absent typed launch field", async () => {
  const writes = [];
  const writer = new DirectorTaskStateWriter({
    async getTaskById() {
      return { id: "task-bound", lane: "auto_director", novelId: "novel-bound", seedPayloadJson: JSON.stringify({ runMode: "auto_to_ready" }) };
    },
    async bootstrapTask(input) { writes.push(input); return input; },
  });
  await assert.rejects(writer.initializeTask({
    workflowTaskId: "task-bound", novelId: "novel-bound", lane: "auto_director",
    directorState: { launch: { runMode: "auto_to_ready", provider: "openai", legacyContext: {} }, run: {} },
  }), /launch contract/i);
  assert.deepEqual(writes, []);
});

for (const identity of [
  { lane: "auto_director", novelId: "novel-bound" },
  { lane: "manual_create", novelId: null },
]) {
  test(`candidate confirmation rejects ${identity.lane} with novelId ${identity.novelId} even without launch conflicts`, async () => {
    const writes = [];
    const writer = new DirectorTaskStateWriter({
      async getTaskById() { return { id: "task-invalid", ...identity, seedPayloadJson: JSON.stringify({ runMode: "auto_to_ready" }) }; },
      async bootstrapTask(input) { writes.push(input); return input; },
    });
    await assert.rejects(writer.initializeTask({
      workflowTaskId: "task-invalid", ...identity,
      directorState: { launch: { runMode: "auto_to_ready", legacyContext: {} }, run: {} },
    }, { replaceLaunchContract: "candidate_confirmation" }), /launch contract|candidate confirmation/i);
    assert.deepEqual(writes, []);
  });
}

for (const { replacement, deferredAttachment } of [
  { replacement: "takeover", deferredAttachment: false },
  { replacement: "candidate_confirmation", deferredAttachment: false },
  { replacement: "takeover", deferredAttachment: true },
  { replacement: "candidate_confirmation", deferredAttachment: true },
]) {
  test(`${replacement} removes omitted typed and legacy launch fields through real bootstrap persistence${deferredAttachment ? " while deferring novel attachment" : ""}`, async () => {
    let task = {
      id: "task-replacement", lane: "auto_director", novelId: replacement === "takeover" && !deferredAttachment ? "novel-bound" : null,
      seedPayloadJson: JSON.stringify({
        runMode: "auto_to_ready", provider: "openai", model: "old-model", temperature: 0.7,
        oldLegacyField: "remove-me", directorInput: { idea: "旧创意" },
        autoExecution: { nextChapterId: "chapter-kept" }, directorSession: { phase: "candidate_selection" },
      }),
    };
    const workflow = new NovelWorkflowService();
    workflow.getTaskById = async () => task;
    workflow.updateTaskWithRetry = async ({ data }) => (task = { ...task, ...data });
    const writer = new DirectorTaskStateWriter(workflow);
    const result = await writer.initializeTask({
      workflowTaskId: task.id, lane: "auto_director",
      ...(deferredAttachment ? { novelId: "novel-target" } : {}),
      directorState: {
        launch: { runMode: "full_book_autopilot", directorInput: { idea: "确认创意" }, legacyContext: { newLegacyField: "new" } },
        run: { directorSession: { phase: "story_macro" } },
      },
    }, { replaceLaunchContract: replacement });
    assert.deepEqual(JSON.parse(task.seedPayloadJson), {
      runMode: "full_book_autopilot", directorInput: { idea: "确认创意" }, newLegacyField: "new",
      autoExecution: { nextChapterId: "chapter-kept" }, directorSession: { phase: "story_macro" },
    });
    if (deferredAttachment) {
      assert.equal(task.novelId, null);
      assert.equal(result.novelId, null);
      assert.equal(result.id, "task-replacement");
    }
  });
}

test("ordinary candidate bootstrap with a target novel still defers attachment and payload merging", async () => {
  const task = {
    id: "task-candidate", lane: "auto_director", novelId: null,
    seedPayloadJson: JSON.stringify({ runMode: "auto_to_ready", directorSession: { phase: "candidate_selection" } }),
  };
  const writes = [];
  const workflow = new NovelWorkflowService();
  workflow.getTaskById = async () => task;
  workflow.updateTaskWithRetry = async (args) => { writes.push(args); return { ...task, ...args.data }; };
  const result = await workflow.bootstrapTask({
    workflowTaskId: task.id, lane: "auto_director", novelId: "novel-target", seedPayload: { model: "unused-model" },
  });
  assert.equal(result, task);
  assert.deepEqual(writes, []);
  assert.equal(result.novelId, null);
});
