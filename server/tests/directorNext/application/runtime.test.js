const test = require("node:test");
const assert = require("node:assert/strict");
const { createDirectorRuntime } = require("../../../dist/modules/director/application");

test("director runtime centralizes IDs, clock, lease expiry and the disabled default", () => {
  let current = new Date("2026-10-01T00:00:00.000Z");
  let sequence = 0;
  const runtime = createDirectorRuntime({
    env: {},
    now: () => current,
    idFactory: () => `id-${++sequence}`,
    workerId: "test-worker",
    leaseMs: 5_000,
  });
  assert.equal(runtime.enabled(), false);
  assert.equal(runtime.workerId(), "test-worker");
  assert.equal(runtime.nextId(), "id-1");
  assert.equal(runtime.leaseExpiresAt(current).toISOString(), "2026-10-01T00:00:05.000Z");
  current = new Date("2026-10-01T00:00:01.000Z");
  assert.equal(runtime.now().toISOString(), "2026-10-01T00:00:01.000Z");
});

test("director runtime reads only the explicit enable flag", () => {
  assert.equal(createDirectorRuntime({ env: { DIRECTOR_NEXT_ENABLED: "true" }, idFactory: () => "id", workerId: "w" }).enabled(), true);
  assert.equal(createDirectorRuntime({ env: { DIRECTOR_NEXT_ENABLED: "1" }, idFactory: () => "id", workerId: "w" }).enabled(), true);
  assert.equal(createDirectorRuntime({ env: { DIRECTOR_NEXT_ENABLED: "yes" }, idFactory: () => "id", workerId: "w" }).enabled(), false);
});

test("invalid lease configuration falls back to a positive default", () => {
  const runtime = createDirectorRuntime({ env: { DIRECTOR_NEXT_LEASE_MS: "invalid" }, now: () => new Date("2026-10-01T00:00:00.000Z"), idFactory: () => "id", workerId: "w" });
  assert.equal(runtime.leaseExpiresAt(new Date("2026-10-01T00:00:00.000Z")).toISOString(), "2026-10-01T00:00:30.000Z");
});
