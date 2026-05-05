const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const {
  DirectorRuntimeExecutionService,
} = require("../dist/services/novel/director/DirectorRuntimeExecutionService.js");
const {
  runtimeStatusForTaskStatus,
} = require("../dist/services/novel/director/DirectorRuntimeExecutionHelpers.js");

function createQueuedRuntimeCommand(overrides = {}) {
  return {
    id: "runtime-command-1",
    runtimeId: "runtime-1",
    workflowTaskId: "task-1",
    novelId: "novel-1",
    legacyCommandId: "legacy-command-1",
    commandType: "continue",
    idempotencyKey: "continue:1",
    status: "queued",
    priority: 65,
    attempt: 0,
    runAfter: new Date("2020-01-01T00:00:00.000Z"),
    payloadJson: "{}",
    runtime: {
      id: "runtime-1",
      checkpointVersion: 0,
    },
    ...overrides,
  };
}

function createLeaseHarness(commands) {
  const original = {
    transaction: prisma.$transaction,
    commandFindMany: prisma.directorRuntimeCommand.findMany,
  };
  const executions = [];
  const runtimeUpdates = [];
  const legacyCommandUpdates = [];
  const events = [];

  const tx = {
    directorRuntimeCommand: {
      findUnique: async ({ where }) => commands.find((command) => command.id === where.id) ?? null,
      updateMany: async ({ where, data }) => {
        const command = commands.find((row) => row.id === where.id);
        if (!command || command.status !== where.status) {
          return { count: 0 };
        }
        if (data.attempt?.increment) {
          command.attempt += data.attempt.increment;
        }
        Object.assign(command, Object.fromEntries(
          Object.entries(data).filter(([key]) => key !== "attempt"),
        ));
        return { count: 1 };
      },
    },
    directorRuntimeExecution: {
      findFirst: async ({ where }) => executions.find((execution) => {
        if (where.runtimeId && execution.runtimeId !== where.runtimeId) {
          return false;
        }
        if (where.novelId && execution.novelId !== where.novelId) {
          return false;
        }
        return where.status.in.includes(execution.status);
      }) ?? null,
      create: async ({ data }) => {
        const execution = {
          id: `execution-${executions.length + 1}`,
          ...data,
        };
        executions.push(execution);
        return execution;
      },
    },
    directorRuntimeInstance: {
      update: async (input) => {
        runtimeUpdates.push(input);
        return input;
      },
    },
    directorRunCommand: {
      updateMany: async (input) => {
        legacyCommandUpdates.push(input);
        return { count: 1 };
      },
    },
    directorRuntimeEvent: {
      create: async ({ data }) => {
        events.push(data);
        return data;
      },
    },
  };

  prisma.directorRuntimeCommand.findMany = async ({ where, skip = 0, take }) => commands.filter((command) => (
    command.status === where.status
      && command.runAfter <= where.runAfter.lte
  )).slice(skip, typeof take === "number" ? skip + take : undefined);
  prisma.$transaction = async (fn) => fn(tx);

  return {
    service: new DirectorRuntimeExecutionService(),
    executions,
    runtimeUpdates,
    legacyCommandUpdates,
    events,
    restore() {
      prisma.$transaction = original.transaction;
      prisma.directorRuntimeCommand.findMany = original.commandFindMany;
    },
  };
}

test("runtime execution service leases different novels in parallel but keeps one active execution per runtime", async () => {
  const harness = createLeaseHarness([
    createQueuedRuntimeCommand({
      id: "runtime-command-a1",
      runtimeId: "runtime-a",
      novelId: "novel-a",
      legacyCommandId: "legacy-a1",
      runtime: { id: "runtime-a", checkpointVersion: 3 },
    }),
    createQueuedRuntimeCommand({
      id: "runtime-command-a2",
      runtimeId: "runtime-a",
      novelId: "novel-a",
      legacyCommandId: "legacy-a2",
      runtime: { id: "runtime-a", checkpointVersion: 3 },
    }),
    createQueuedRuntimeCommand({
      id: "runtime-command-b1",
      runtimeId: "runtime-b",
      novelId: "novel-b",
      legacyCommandId: "legacy-b1",
      runtime: { id: "runtime-b", checkpointVersion: 1 },
    }),
  ]);
  try {
    const first = await harness.service.leaseNextExecution({
      workerId: "worker-a",
      slotId: "slot-1",
      leaseMs: 30_000,
    });
    const second = await harness.service.leaseNextExecution({
      workerId: "worker-a",
      slotId: "slot-2",
      leaseMs: 30_000,
    });

    assert.equal(first.runtimeId, "runtime-a");
    assert.equal(first.novelId, "novel-a");
    assert.equal(second.runtimeId, "runtime-b");
    assert.equal(second.novelId, "novel-b");
    assert.equal(harness.executions.length, 2);
    assert.deepEqual(harness.executions.map((execution) => execution.runtimeId), ["runtime-a", "runtime-b"]);
  } finally {
    harness.restore();
  }
});

test("runtime status helper does not complete runtime from task status alone", () => {
  assert.equal(runtimeStatusForTaskStatus({ taskStatus: "running" }), "running");
  assert.equal(runtimeStatusForTaskStatus({ taskStatus: "queued" }), "waiting_worker");
  assert.equal(runtimeStatusForTaskStatus({ taskStatus: "succeeded" }), "completed");
  assert.equal(runtimeStatusForTaskStatus({ taskStatus: "failed" }), "failed_recoverable");
  assert.equal(runtimeStatusForTaskStatus({ taskStatus: "cancelled" }), "cancelled");
  assert.equal(runtimeStatusForTaskStatus({ taskStatus: "unknown" }), "waiting_worker");
});

test("runtime execution service scans past a blocked candidate batch", async () => {
  const blockedNovelCommands = Array.from({ length: 26 }, (_, index) => createQueuedRuntimeCommand({
    id: `runtime-command-a${index + 1}`,
    runtimeId: "runtime-a",
    novelId: "novel-a",
    legacyCommandId: `legacy-a${index + 1}`,
    idempotencyKey: `continue:a${index + 1}`,
    runtime: { id: "runtime-a", checkpointVersion: 3 },
  }));
  const harness = createLeaseHarness([
    ...blockedNovelCommands,
    createQueuedRuntimeCommand({
      id: "runtime-command-b1",
      runtimeId: "runtime-b",
      novelId: "novel-b",
      legacyCommandId: "legacy-b1",
      idempotencyKey: "continue:b1",
      runtime: { id: "runtime-b", checkpointVersion: 1 },
    }),
  ]);
  try {
    const first = await harness.service.leaseNextExecution({
      workerId: "worker-a",
      slotId: "slot-1",
      leaseMs: 30_000,
    });
    const second = await harness.service.leaseNextExecution({
      workerId: "worker-a",
      slotId: "slot-2",
      leaseMs: 30_000,
    });

    assert.equal(first.novelId, "novel-a");
    assert.equal(second.novelId, "novel-b");
    assert.equal(harness.executions.length, 2);
  } finally {
    harness.restore();
  }
});

test("runtime execution service requeues stale leased commands without executions", async () => {
  const original = {
    transaction: prisma.$transaction,
    executionFindMany: prisma.directorRuntimeExecution.findMany,
    commandFindMany: prisma.directorRuntimeCommand.findMany,
  };
  const now = new Date("2026-05-04T00:00:00.000Z");
  const command = {
    ...createQueuedRuntimeCommand({
      id: "runtime-command-orphan",
      status: "leased",
      leaseOwner: "dead-worker:slot-1",
      leaseExpiresAt: new Date("2026-05-03T23:00:00.000Z"),
      legacyCommandId: "legacy-orphan",
    }),
    executions: [],
  };
  const legacyUpdates = [];
  const runtimeUpdates = [];
  const events = [];
  const tx = {
    directorRuntimeCommand: {
      findUnique: async ({ where }) => (where.id === command.id ? command : null),
      update: async ({ data }) => {
        Object.assign(command, data);
        return command;
      },
    },
    directorRunCommand: {
      updateMany: async (input) => {
        legacyUpdates.push(input);
        return { count: 1 };
      },
    },
    directorRuntimeInstance: {
      update: async (input) => {
        runtimeUpdates.push(input);
        return input;
      },
    },
    directorRuntimeEvent: {
      create: async ({ data }) => {
        events.push(data);
        return data;
      },
    },
  };
  prisma.directorRuntimeExecution.findMany = async () => [];
  prisma.directorRuntimeCommand.findMany = async () => [command];
  prisma.$transaction = async (fn) => fn(tx);

  try {
    const service = new DirectorRuntimeExecutionService();
    const recovered = await service.recoverStaleExecutions(now, 120_000);

    assert.equal(recovered, 1);
    assert.equal(command.status, "queued");
    assert.equal(command.leaseOwner, null);
    assert.equal(command.leaseExpiresAt, null);
    assert.equal(legacyUpdates.length, 1);
    assert.equal(runtimeUpdates.length, 1);
    assert.equal(events[0].type, "command_requeued");
  } finally {
    prisma.$transaction = original.transaction;
    prisma.directorRuntimeExecution.findMany = original.executionFindMany;
    prisma.directorRuntimeCommand.findMany = original.commandFindMany;
  }
});

test("runtime execution service does not reset an adopted running command to queued", async () => {
  const original = {
    taskFindUnique: prisma.novelWorkflowTask.findUnique,
    runFindUnique: prisma.directorRun.findUnique,
    runtimeFindFirst: prisma.directorRuntimeInstance.findFirst,
    runtimeUpdate: prisma.directorRuntimeInstance.update,
    commandFindFirst: prisma.directorRuntimeCommand.findFirst,
    commandUpdate: prisma.directorRuntimeCommand.update,
    eventCreate: prisma.directorRuntimeEvent.create,
  };
  const updates = [];
  const events = [];
  const runtime = {
    id: "runtime-1",
    novelId: "novel-1",
    workflowTaskId: "task-1",
    runId: null,
    runMode: "full_book_autopilot",
    status: "running",
  };
  const runtimeCommand = {
    id: "runtime-command-1",
    runtimeId: "runtime-1",
    commandType: "continue",
    idempotencyKey: "continue:1",
    status: "running",
    runAfter: new Date("2026-05-03T01:00:00.000Z"),
  };

  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task-1",
    novelId: "novel-1",
    status: "running",
    cancelRequestedAt: null,
    seedPayloadJson: "{}",
  });
  prisma.directorRun.findUnique = async () => null;
  prisma.directorRuntimeInstance.findFirst = async () => runtime;
  prisma.directorRuntimeInstance.update = async ({ data }) => ({ ...runtime, ...data });
  prisma.directorRuntimeCommand.findFirst = async () => runtimeCommand;
  prisma.directorRuntimeCommand.update = async ({ data }) => {
    updates.push(data);
    return { ...runtimeCommand, ...data };
  };
  prisma.directorRuntimeEvent.create = async ({ data }) => {
    events.push(data);
    return data;
  };

  try {
    const service = new DirectorRuntimeExecutionService();
    const result = await service.ensureRuntimeCommandForLegacyCommand({
      id: "legacy-command-1",
      taskId: "task-1",
      novelId: "novel-1",
      commandType: "continue",
      idempotencyKey: "continue:1",
      payloadJson: "{}",
    }, {
      runMode: "full_book_autopilot",
    });

    assert.equal(result.runtimeCommand.id, "runtime-command-1");
    assert.equal(updates.length, 1);
    assert.equal("status" in updates[0], false);
    assert.equal("errorMessage" in updates[0], false);
    assert.equal(events.length, 1);
  } finally {
    prisma.novelWorkflowTask.findUnique = original.taskFindUnique;
    prisma.directorRun.findUnique = original.runFindUnique;
    prisma.directorRuntimeInstance.findFirst = original.runtimeFindFirst;
    prisma.directorRuntimeInstance.update = original.runtimeUpdate;
    prisma.directorRuntimeCommand.findFirst = original.commandFindFirst;
    prisma.directorRuntimeCommand.update = original.commandUpdate;
    prisma.directorRuntimeEvent.create = original.eventCreate;
  }
});
