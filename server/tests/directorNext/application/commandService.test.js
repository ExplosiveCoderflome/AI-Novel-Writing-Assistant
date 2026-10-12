const test = require("node:test");
const assert = require("node:assert/strict");
const { contract, runningControl } = require("../fixtures");
const {
  CommandService,
  CommandVersionConflictError,
  ActiveRunConflictError,
  InvalidDirectorCommandError,
} = require("../../../dist/modules/director/application");
const { VersionConflictError } = require("../../../dist/modules/director/domain");

function setup({ activeRunId = null, control = runningControl() } = {}) {
  const calls = [];
  const commands = new Map();
  const controls = new Map([["run-1", control]]);
  const runContracts = new Map([["run-1", contract()]]);
  const runRepository = {
    findActiveRunIdByNovel: async () => activeRunId,
    open: async (nextContract) => {
      calls.push(["open", nextContract]);
      runContracts.set(nextContract.runId, nextContract);
      controls.set(nextContract.runId, { ...runningControl(), status: "queued", version: 0 });
      return controls.get(nextContract.runId);
    },
    getControl: async (runId) => controls.get(runId) ?? null,
    getContract: async (runId) => runContracts.get(runId) ?? null,
    transition: async (runId, event, expectedVersion) => {
      calls.push(["transition", runId, event, expectedVersion]);
      const current = controls.get(runId);
      if (!current || current.version !== expectedVersion) {
        throw new VersionConflictError(expectedVersion, current?.version ?? -1);
      }
      const next = { ...current, version: current.version + 1 };
      if (event.type === "cancel") next.status = "cancelled";
      if (event.type === "resume") next.status = "running";
      controls.set(runId, next);
      return next;
    },
  };
  const commandRepository = {
    find: async (key) => commands.get(key) ?? null,
    save: async (input) => {
      const record = { id: input.id, idempotencyKey: input.idempotencyKey, runId: input.runId, type: input.type, payload: input.payload, result: input.result };
      commands.set(input.idempotencyKey, record);
      return record;
    },
    openRun: async (input) => {
      const existing = commands.get(input.idempotencyKey);
      if (existing) return { runId: existing.runId, control: controls.get(existing.runId), commandId: existing.id, replayed: true };
      const control = await runRepository.open(input.contract);
      const result = { runId: input.runId, control, commandId: input.id, replayed: false };
      await commandRepository.save({ ...input, result: { runId: input.runId, controlVersion: control.version, commandId: input.id } });
      return result;
    },
    transition: async (input) => {
      const existing = commands.get(input.idempotencyKey);
      if (existing) return { runId: existing.runId, control: controls.get(existing.runId), commandId: existing.id, replayed: true };
      const control = await runRepository.transition(input.runId, input.event, input.expectedVersion);
      const result = { runId: input.runId, control, commandId: input.id, replayed: false };
      await commandRepository.save({ ...input, result: { runId: input.runId, controlVersion: control.version, commandId: input.id } });
      return result;
    },
    handoff: async (input) => {
      const existing = commands.get(input.idempotencyKey);
      if (existing) return { runId: existing.runId, control: controls.get(existing.runId), commandId: existing.id, replayed: true };
      await runRepository.transition(input.oldRunId, { type: "cancel" }, input.oldExpectedVersion);
      const control = await runRepository.open(input.newContract);
      const result = { runId: input.newRunId, control, commandId: input.id, replayed: false };
      await commandRepository.save({ ...input, runId: input.newRunId, result: { runId: input.newRunId, controlVersion: control.version, commandId: input.id } });
      return result;
    },
  };
  const service = new CommandService({
    runRepository,
    commandRepository,
    runtime: { nextId: (() => { let n = 0; return () => `generated-${++n}`; })() },
    contractFactory: ({ runId, novelId, driver, stepIdsInScope }) => contract({ runId, novelId, driver, stepIdsInScope }),
  });
  return { service, calls, commands };
}

test("the same idempotency key returns the first result without a second transition", async () => {
  const { service, calls } = setup();
  const command = { type: "cancel", runId: "run-1", expectedVersion: 1, idempotencyKey: "cancel-1" };
  const first = await service.execute(command);
  const second = await service.execute(command);
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.deepEqual(calls, [["transition", "run-1", { type: "cancel" }, 1]]);
});

test("an active run rejects open_run before a new run is created", async () => {
  const { service, calls } = setup({ activeRunId: "run-1" });
  await assert.rejects(
    () => service.execute({ type: "open_run", novelId: "novel-1", driver: "auto", stepIdsInScope: null, idempotencyKey: "open-1" }),
    (error) => error.name === "ActiveRunConflictError" && error.statusCode === 409,
  );
  assert.deepEqual(calls, []);
});

test("a stale expected version becomes a structured 409 error", async () => {
  const { service } = setup();
  await assert.rejects(
    () => service.execute({ type: "cancel", runId: "run-1", expectedVersion: 99, idempotencyKey: "cancel-stale" }),
    (error) => error.name === "CommandVersionConflictError" && error.statusCode === 409,
  );
});

test("only a paused run can accept resume and other commands cannot clear it", async () => {
  const { service, calls } = setup({ control: { ...runningControl(), version: 4, status: "paused", pause: { kind: "manual_recovery", reason: "needs_user" } } });
  await service.execute({ type: "resume", runId: "run-1", expectedVersion: 4, idempotencyKey: "resume-1" });
  assert.deepEqual(calls, [["transition", "run-1", { type: "resume" }, 4]]);
  await assert.rejects(
    () => service.execute({ type: "resolve_gate", runId: "run-1", decision: "confirm", expectedVersion: 5, idempotencyKey: "gate-1" }),
    (error) => error.name === "InvalidDirectorCommandError",
  );
});

test("handoff closes the old run and opens a new run with the same scope", async () => {
  const { service, calls } = setup({ control: { ...runningControl(), version: 2, status: "running" } });
  const result = await service.execute({ type: "handoff", runId: "run-1", toDriver: "assisted", expectedVersion: 2, idempotencyKey: "handoff-1" });
  assert.equal(result.runId, "generated-1");
  assert.deepEqual(calls.map((call) => call[0]), ["transition", "open"]);
  assert.deepEqual(calls[0], ["transition", "run-1", { type: "cancel" }, 2]);
  assert.equal(calls[1][1].driver, "assisted");
  assert.equal(calls[1][1].scope, "book");
});

test("unknown command types are rejected before any repository call", async () => {
  const { service, calls } = setup();
  await assert.rejects(() => service.execute({ type: "unknown", idempotencyKey: "bad" }), (error) => error.name === "InvalidDirectorCommandError");
  assert.deepEqual(calls, []);
});
