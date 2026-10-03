const test = require("node:test");
const assert = require("node:assert/strict");
const { DirectorWorker } = require("../../../dist/modules/director/application");
const { contract } = require("../fixtures");

function createHarness() {
  let now = new Date("2026-10-01T00:00:00.000Z");
  const leases = new Map();
  const executions = [];
  const repository = {
    listLeaseCandidates: async () => ["run-1"],
    acquireLease: async (runId, owner, leaseExpiresAt) => {
      const current = leases.get(runId);
      if (current && current.expiresAt > now && current.owner !== owner) return false;
      leases.set(runId, { owner, expiresAt: leaseExpiresAt });
      return true;
    },
    heartbeat: async (runId, owner, leaseExpiresAt) => {
      const current = leases.get(runId);
      if (!current || current.owner !== owner || current.expiresAt <= now) return false;
      leases.set(runId, { owner, expiresAt: leaseExpiresAt });
      return true;
    },
  };
  const runtime = (workerId) => ({
    workerId: () => workerId,
    now: () => now,
    leaseExpiresAt: (value) => new Date(value.getTime() + 10_000),
  });
  const executor = {
    runOnce: async (runId) => {
      executions.push(runId);
      return { kind: executions.length === 1 ? "executed" : "completed" };
    },
  };
  return { repository, runtime, executor, executions, leases, advance: (ms) => { now = new Date(now.getTime() + ms); } };
}

test("two workers competing for one run leave only one executor call", async () => {
  const harness = createHarness();
  const first = new DirectorWorker({ runRepository: harness.repository, executor: harness.executor, runtime: harness.runtime("worker-a") });
  const second = new DirectorWorker({ runRepository: harness.repository, executor: harness.executor, runtime: harness.runtime("worker-b") });
  const results = await Promise.all([first.tick(), second.tick()]);
  assert.deepEqual(results.sort(), [false, true]);
  assert.equal(harness.executions.length, 1);
});

test("a lease that expires can be claimed by another worker", async () => {
  const harness = createHarness();
  const first = new DirectorWorker({ runRepository: harness.repository, executor: harness.executor, runtime: harness.runtime("worker-a") });
  const second = new DirectorWorker({ runRepository: harness.repository, executor: harness.executor, runtime: harness.runtime("worker-b") });
  assert.equal(await first.tick(), true);
  harness.advance(11_000);
  assert.equal(await second.tick(), true);
  assert.deepEqual(harness.executions, ["run-1", "run-1"]);
  assert.equal(harness.leases.get("run-1").owner, "worker-b");
});

test("a newly opened queued run is started before its first execution turn", async () => {
  const harness = createHarness();
  let control = { version: 0, status: "queued", pause: null, gate: null, cursorStepId: null, failureReason: null };
  const transitions = [];
  harness.repository.getControl = async () => control;
  harness.repository.transition = async (_runId, event, expectedVersion) => {
    assert.equal(expectedVersion, control.version);
    transitions.push(event.type);
    control = { ...control, version: control.version + 1, status: event.type === "start" ? "running" : control.status };
    return control;
  };
  const worker = new DirectorWorker({ runRepository: harness.repository, executor: harness.executor, runtime: harness.runtime("worker-a") });
  assert.equal(await worker.tick(), true);
  assert.deepEqual(transitions, ["start"]);
  assert.deepEqual(harness.executions, ["run-1"]);
});

test("worker does not clear a paused run or claim it as new work", async () => {
  const harness = createHarness();
  harness.repository.listLeaseCandidates = async () => [];
  const worker = new DirectorWorker({ runRepository: harness.repository, executor: harness.executor, runtime: harness.runtime("worker-a") });
  assert.equal(await worker.tick(), false);
  assert.deepEqual(harness.executions, []);
});

test("one policy retry is allowed before the worker pauses for manual recovery", async () => {
  const harness = createHarness();
  let control = { version: 1, status: "running", pause: null, gate: null, cursorStepId: null, failureReason: null };
  const events = [];
  let failures = 0;
  const repository = {
    ...harness.repository,
    getContract: async () => contract({ issuePolicy: { mode: "completion_first", version: "policy-1" } }),
    getControl: async () => control,
    transition: async (_runId, event, expectedVersion) => {
      assert.equal(control.version, expectedVersion);
      control = {
        ...control,
        version: control.version + 1,
        status: event.type === "pause" ? "paused" : control.status,
        pause: event.type === "pause" ? event.pause : control.pause,
      };
      return control;
    },
  };
  const executor = { runOnce: async () => { failures += 1; throw new Error(`failure-${failures}`); } };
  const eventLog = {
    list: async () => events,
    append: async (input) => { events.push({ type: input.type, payload: input.payload }); },
  };
  const first = new DirectorWorker({
    runRepository: repository,
    executor,
    eventLog,
    recoveryPolicy: { maxAttempts: () => 1 },
    runtime: harness.runtime("worker-a"),
  });
  const second = new DirectorWorker({
    runRepository: repository,
    executor,
    eventLog,
    recoveryPolicy: { maxAttempts: () => 1 },
    runtime: harness.runtime("worker-b"),
  });
  assert.equal(await first.tick(), true);
  harness.advance(11_000);
  assert.equal(await second.tick(), true);
  assert.equal(control.status, "paused");
  assert.deepEqual(events.map((event) => event.type), ["execution_failure", "execution_failure", "stop_signal"]);
});

test("invalid persisted facts pause immediately while error text alone follows the retry budget", async () => {
  const {InvalidStopSignalError} = require('../../../dist/modules/director/application');
  for (const error of [new InvalidStopSignalError(1), new Error('invalid director stop signal event at seq 1')]) {
    const harness = createHarness();
    let control = {version: 1, status: 'running', pause: null};
    const events = [];
    const repo = {...harness.repository, getContract: async () => contract(), getControl: async () => control,
      listLeaseCandidates: async () => control.status === 'running' ? ['run-1'] : [],
      transition: async (_runId, event, version) => {
        assert.equal(version, control.version);
        control = {...control, version: version+1, status: 'paused', pause: event.pause};
      }};
    const worker = new DirectorWorker({runRepository: repo, runtime: harness.runtime('worker'),
      executor: {runOnce: async () => {throw error;}}, recoveryPolicy: {maxAttempts: () => 9},
      eventLog: {list: async () => events, append: async event => events.push(event)}});
    await worker.tick();
    if (error instanceof InvalidStopSignalError) {
      assert.equal(control.status, 'paused');
      assert.equal(control.pause.kind, 'safety');
      assert.equal(events[0].type, 'stop_signal');
      assert.equal(events[0].payload.kind, 'data_integrity');
      assert.equal(await worker.tick(), false);
    } else {
      assert.equal(control.status, 'running');
      assert.deepEqual(events.map(event => event.type), ['execution_failure']);
    }
  }
});
