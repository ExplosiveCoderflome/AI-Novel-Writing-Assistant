const test = require("node:test");
const assert = require("node:assert/strict");

const { DirectorTaskStateWriter } = require("../dist/services/novel/director/state/index.js");

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

test("ordinary task initialization fills absent launch fields without changing populated ones", async () => {
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
