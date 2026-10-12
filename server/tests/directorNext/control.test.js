const test = require("node:test");
const assert = require("node:assert/strict");
const { domain } = require("./fixtures");

// 测试自带的期望表，独立于实现；修改迁移表必须同时修改这里。
const ALLOWED = {
  queued: { start: "running", cancel: "cancelled" },
  running: {
    step_started: "running",
    step_finished: "running",
    open_gate: "waiting_gate",
    pause: "paused",
    complete: "completed",
    fail: "failed",
    cancel: "cancelled",
  },
  waiting_gate: { resolve_gate: "running", fail: "failed", cancel: "cancelled" },
  paused: { resume: "running", cancel: "cancelled" },
  completed: {},
  failed: {},
  cancelled: {},
};

function sampleEvent(type) {
  switch (type) {
    case "step_started":
      return { type, stepId: "story_macro" };
    case "open_gate":
      return { type, gateId: "gate-1", artifactTypes: ["story_macro"] };
    case "pause":
      return { type, pause: { kind: "manual_recovery", reason: "test" } };
    case "fail":
      return { type, reason: "boom" };
    default:
      return { type };
  }
}

function controlIn(status) {
  return { ...domain.initialControl(), status, version: 5 };
}

test("the transition table is exhaustive over every status and event type", () => {
  assert.deepEqual([...domain.RUN_STATUSES].sort(), Object.keys(ALLOWED).sort());
  for (const status of domain.RUN_STATUSES) {
    for (const eventType of domain.RUN_EVENT_TYPES) {
      const expected = ALLOWED[status][eventType];
      const event = sampleEvent(eventType);
      if (expected) {
        const next = domain.applyEvent(controlIn(status), event);
        assert.equal(next.status, expected, `${status} --${eventType}--> ${expected}`);
        assert.equal(next.version, 6, "version increments on every transition");
      } else {
        assert.throws(
          () => domain.applyEvent(controlIn(status), event),
          (error) => error.name === "InvalidTransitionError" && error.from === status,
          `${status} --${eventType}--> must be rejected`,
        );
      }
    }
  }
});

test("a paused run can only be left by resume or cancel", () => {
  const leaving = domain.RUN_EVENT_TYPES.filter((eventType) => {
    try {
      domain.applyEvent(controlIn("paused"), sampleEvent(eventType));
      return true;
    } catch {
      return false;
    }
  });
  assert.deepEqual(leaving.sort(), ["cancel", "resume"]);
});

test("terminal runs accept no events", () => {
  for (const status of ["completed", "failed", "cancelled"]) {
    assert.equal(domain.isTerminalStatus(status), true);
    for (const eventType of domain.RUN_EVENT_TYPES) {
      assert.throws(() => domain.applyEvent(controlIn(status), sampleEvent(eventType)));
    }
  }
  assert.equal(domain.isTerminalStatus("running"), false);
});

test("expectedVersion mismatch raises a version conflict and changes nothing", () => {
  const control = controlIn("queued");
  assert.throws(
    () => domain.applyEvent(control, { type: "start" }, 4),
    (error) => error.name === "VersionConflictError" && error.expected === 4 && error.actual === 5,
  );
  assert.equal(control.status, "queued");
  assert.equal(domain.applyEvent(control, { type: "start" }, 5).status, "running");
});

test("events carry their payload into the control state", () => {
  let control = domain.applyEvent(domain.initialControl(), { type: "start" });
  control = domain.applyEvent(control, { type: "step_started", stepId: "story_macro" });
  assert.equal(control.cursorStepId, "story_macro");
  control = domain.applyEvent(control, { type: "step_finished" });
  assert.equal(control.cursorStepId, null);

  control = domain.applyEvent(control, {
    type: "open_gate",
    gateId: "gate-1",
    artifactTypes: ["story_macro", "character_cast"],
  });
  assert.equal(control.status, "waiting_gate");
  assert.deepEqual(control.gate, { id: "gate-1", artifactTypes: ["story_macro", "character_cast"] });
  control = domain.applyEvent(control, { type: "resolve_gate" });
  assert.equal(control.gate, null);

  control = domain.applyEvent(control, {
    type: "pause",
    pause: { kind: "replan", reason: "need replan" },
  });
  assert.deepEqual(control.pause, { kind: "replan", reason: "need replan" });
  control = domain.applyEvent(control, { type: "resume" });
  assert.equal(control.pause, null);
  assert.equal(control.status, "running");

  control = domain.applyEvent(control, { type: "fail", reason: "boom" });
  assert.equal(control.failureReason, "boom");
});

test("applyEvent never mutates its input", () => {
  const control = Object.freeze({ ...domain.initialControl() });
  assert.doesNotThrow(() => domain.applyEvent(control, { type: "start" }));
});
