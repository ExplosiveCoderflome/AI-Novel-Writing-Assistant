const test = require("node:test");
const assert = require("node:assert/strict");
const { DirectorWorker } = require("../../../dist/modules/director/application");

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

test("worker does not clear a paused run or claim it as new work", async () => {
  const harness = createHarness();
  harness.repository.listLeaseCandidates = async () => [];
  const worker = new DirectorWorker({ runRepository: harness.repository, executor: harness.executor, runtime: harness.runtime("worker-a") });
  assert.equal(await worker.tick(), false);
  assert.deepEqual(harness.executions, []);
});
