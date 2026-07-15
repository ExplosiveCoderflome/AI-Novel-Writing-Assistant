const test = require("node:test");
const assert = require("node:assert/strict");

const {
  NovelSideEffectJobService,
  computeNovelSideEffectRetryDelayMs,
} = require("../dist/events/sideEffects/NovelSideEffectJobService.js");
const {
  NovelSideEffectWorker,
} = require("../dist/events/sideEffects/NovelSideEffectWorker.js");
const {
  NovelSideEffectJobHandlers,
  UnsupportedNovelSideEffectPayloadError,
} = require("../dist/events/sideEffects/NovelSideEffectJobHandlers.js");
const {
  NOVEL_SIDE_EFFECT_JOB_TYPES,
} = require("../dist/events/sideEffects/NovelSideEffectJobTypes.js");
const { EventBus } = require("../dist/events/EventBus.js");
const { registerNovelEventHandlers } = require("../dist/events/handlers/registerNovelEventHandlers.js");

function cloneJob(job) {
  return job ? { ...job } : null;
}

function createFakeJobDb() {
  const jobs = [];
  let nextId = 1;

  function matchesValue(value, condition) {
    if (condition && typeof condition === "object" && !Array.isArray(condition)) {
      if (condition.in && !condition.in.includes(value)) return false;
      if (condition.lte && !(value <= condition.lte)) return false;
      if (condition.lt && !(value < condition.lt)) return false;
      return true;
    }
    return value === condition;
  }

  function matchesWhere(job, where = {}) {
    return Object.entries(where).every(([key, condition]) => matchesValue(job[key], condition));
  }

  function applyData(job, data) {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "increment" in value) {
        job[key] += value.increment;
      } else {
        job[key] = value;
      }
    }
    job.updatedAt = new Date();
  }

  const delegate = {
    async findUnique({ where }) {
      if (where.id) return cloneJob(jobs.find((job) => job.id === where.id));
      if (where.idempotencyKey) return cloneJob(jobs.find((job) => job.idempotencyKey === where.idempotencyKey));
      return null;
    },
    async findFirst({ where }) {
      const matches = jobs
        .filter((job) => matchesWhere(job, where))
        .sort((left, right) => {
          const runAfter = left.runAfter - right.runAfter;
          if (runAfter !== 0) return runAfter;
          const createdAt = left.createdAt - right.createdAt;
          if (createdAt !== 0) return createdAt;
          return left.id.localeCompare(right.id);
        });
      return cloneJob(matches[0]);
    },
    async create({ data }) {
      if (jobs.some((job) => job.idempotencyKey === data.idempotencyKey)) {
        const error = new Error("Unique constraint failed");
        error.code = "P2002";
        throw error;
      }
      const now = new Date();
      const job = {
        id: `job-${nextId++}`,
        novelId: data.novelId ?? null,
        jobType: data.jobType,
        status: data.status ?? "pending",
        idempotencyKey: data.idempotencyKey,
        payloadVersion: data.payloadVersion ?? 1,
        payloadJson: data.payloadJson,
        attempts: data.attempts ?? 0,
        maxAttempts: data.maxAttempts ?? 5,
        runAfter: data.runAfter ?? now,
        leaseOwner: data.leaseOwner ?? null,
        leaseExpiresAt: data.leaseExpiresAt ?? null,
        lastError: data.lastError ?? null,
        finishedAt: data.finishedAt ?? null,
        createdAt: now,
        updatedAt: now,
      };
      jobs.push(job);
      return cloneJob(job);
    },
    async updateMany({ where, data }) {
      let count = 0;
      for (const job of jobs) {
        if (!matchesWhere(job, where)) continue;
        applyData(job, data);
        count += 1;
      }
      return { count };
    },
  };

  return {
    db: { novelSideEffectJob: delegate },
    jobs,
  };
}

function createService(fake, options = {}) {
  const now = options.now ?? (() => new Date("2026-05-26T00:00:00.000Z"));
  return new NovelSideEffectJobService({
    db: fake.db,
    now,
    random: options.random ?? (() => 0),
    retryBaseMs: options.retryBaseMs ?? 100,
    retryMaxMs: options.retryMaxMs ?? 1000,
    retryJitterMs: options.retryJitterMs ?? 20,
  });
}

test("enqueueJob deduplicates by idempotency key", async () => {
  const fake = createFakeJobDb();
  const service = createService(fake);
  const input = {
    novelId: "novel-1",
    jobType: "novel.pipelineSnapshot",
    idempotencyKey: "snapshot:job-1",
    payload: { novelId: "novel-1", jobId: "job-1", label: "pipeline-job-1" },
  };

  const first = await service.enqueueJob(input);
  const second = await service.enqueueJob(input);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.job.id, second.job.id);
  assert.equal(fake.jobs.length, 1);
});

test("side effect job types do not expose retired chapter draft dynamics sync", () => {
  assert.equal(NOVEL_SIDE_EFFECT_JOB_TYPES.includes("character.chapterDraftSync"), false);
  assert.equal(NOVEL_SIDE_EFFECT_JOB_TYPES.includes("payoff.bookContractSync"), true);
});

test("book contract payoff changes enqueue one durable ledger sync job", async () => {
  const enqueued = [];
  const bus = new EventBus();
  registerNovelEventHandlers(bus, {
    sideEffectJobs: {
      async enqueueJob(input) {
        enqueued.push(input);
        return { created: true, job: input };
      },
    },
  });

  await bus.emit({
    type: "book-contract:updated",
    payload: {
      novelId: "novel-1",
      payoffChanged: false,
      contractUpdatedAt: "2026-07-14T00:00:00.000Z",
    },
  });
  await bus.emit({
    type: "book-contract:updated",
    payload: {
      novelId: "novel-1",
      payoffChanged: true,
      contractUpdatedAt: "2026-07-14T00:00:01.000Z",
    },
  });

  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].jobType, "payoff.bookContractSync");
  assert.equal(
    enqueued[0].idempotencyKey,
    "payoff.bookContractSync:novel-1:2026-07-14T00:00:01.000Z",
  );
  assert.deepEqual(enqueued[0].payload, { novelId: "novel-1" });
});

test("book contract payoff sync job delegates to the existing ledger synchronizer", async () => {
  const calls = [];
  const handlers = new NovelSideEffectJobHandlers({
    async syncPayoffLedger(novelId) {
      calls.push(novelId);
    },
  });

  await handlers.execute({
    jobType: "payoff.bookContractSync",
    payloadVersion: 1,
    payloadJson: JSON.stringify({ novelId: "novel-1" }),
  });

  assert.deepEqual(calls, ["novel-1"]);
});

test("leaseNext uses conditional update so concurrent workers cannot claim the same job", async () => {
  const fake = createFakeJobDb();
  const service = createService(fake);
  await service.enqueueJob({
    novelId: "novel-1",
    jobType: "novel.pipelineSnapshot",
    idempotencyKey: "snapshot:job-1",
    payload: { novelId: "novel-1", jobId: "job-1", label: "pipeline-job-1" },
  });

  const [left, right] = await Promise.all([
    service.leaseNext({ workerId: "worker-a", leaseMs: 1000 }),
    service.leaseNext({ workerId: "worker-b", leaseMs: 1000 }),
  ]);

  assert.equal([left, right].filter(Boolean).length, 1);
  const leased = left ?? right;
  assert.equal(leased.status, "running");
  assert.equal(leased.attempts, 1);
  assert.match(leased.leaseOwner, /^worker-/);
});

test("state updates reject invalid transitions", async () => {
  const fake = createFakeJobDb();
  const service = createService(fake);
  const { job } = await service.enqueueJob({
    novelId: "novel-1",
    jobType: "novel.pipelineSnapshot",
    idempotencyKey: "snapshot:job-1",
    payload: { novelId: "novel-1", jobId: "job-1", label: "pipeline-job-1" },
  });

  await assert.rejects(
    () => service.markSucceeded(job),
    /was not running/,
  );
});

test("failed jobs use exponential backoff with jitter before retry", async () => {
  const fake = createFakeJobDb();
  const service = createService(fake, {
    random: () => 0.5,
    now: () => new Date("2026-05-26T00:00:00.000Z"),
  });
  await service.enqueueJob({
    novelId: "novel-1",
    jobType: "novel.pipelineSnapshot",
    idempotencyKey: "snapshot:job-1",
    maxAttempts: 2,
    payload: { novelId: "novel-1", jobId: "job-1", label: "pipeline-job-1" },
  });
  const leased = await service.leaseNext({ workerId: "worker-a", leaseMs: 1000 });

  const status = await service.markFailedOrDead(leased, new Error("boom"));

  assert.equal(status, "failed");
  assert.equal(fake.jobs[0].status, "failed");
  assert.equal(fake.jobs[0].runAfter.toISOString(), "2026-05-26T00:00:00.110Z");
  assert.equal(computeNovelSideEffectRetryDelayMs({
    attempt: 4,
    baseMs: 100,
    maxMs: 500,
    jitterMs: 20,
    random: () => 0.5,
  }), 510);
});

test("jobs move to dead after max attempts", async () => {
  const fake = createFakeJobDb();
  const service = createService(fake);
  await service.enqueueJob({
    novelId: "novel-1",
    jobType: "novel.pipelineSnapshot",
    idempotencyKey: "snapshot:job-1",
    maxAttempts: 1,
    payload: { novelId: "novel-1", jobId: "job-1", label: "pipeline-job-1" },
  });
  const leased = await service.leaseNext({ workerId: "worker-a", leaseMs: 1000 });

  const status = await service.markFailedOrDead(leased, new Error("boom"));

  assert.equal(status, "dead");
  assert.equal(fake.jobs[0].status, "dead");
  assert.ok(fake.jobs[0].finishedAt instanceof Date);
});

test("worker sends unsupported payload versions to dead state", async () => {
  const fake = createFakeJobDb();
  const service = createService(fake);
  await service.enqueueJob({
    novelId: "novel-1",
    jobType: "novel.pipelineSnapshot",
    idempotencyKey: "snapshot:job-1",
    payloadVersion: 999,
    payload: { novelId: "novel-1", jobId: "job-1", label: "pipeline-job-1" },
  });
  const worker = new NovelSideEffectWorker(service, {
    async execute() {
      throw new UnsupportedNovelSideEffectPayloadError("unsupported");
    },
  }, {
    workerId: "worker-a",
    leaseMs: 1000,
    pollMs: 1000,
  });

  await worker.tick();

  assert.equal(fake.jobs[0].status, "dead");
  assert.equal(fake.jobs[0].lastError, "unsupported");
});

test("expired running jobs are recovered as retryable failures", async () => {
  const fake = createFakeJobDb();
  const service = createService(fake, {
    now: () => new Date("2026-05-26T00:00:00.000Z"),
  });
  await service.enqueueJob({
    novelId: "novel-1",
    jobType: "novel.pipelineSnapshot",
    idempotencyKey: "snapshot:job-1",
    payload: { novelId: "novel-1", jobId: "job-1", label: "pipeline-job-1" },
  });
  const leased = await service.leaseNext({
    workerId: "worker-a",
    leaseMs: 1000,
    now: new Date("2026-05-26T00:00:00.000Z"),
  });
  assert.equal(leased.status, "running");

  const count = await service.recoverExpiredRunningJobs(new Date("2026-05-26T00:00:02.000Z"));

  assert.equal(count, 1);
  assert.equal(fake.jobs[0].status, "failed");
  assert.equal(fake.jobs[0].runAfter.toISOString(), "2026-05-26T00:00:02.000Z");
});
