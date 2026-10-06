const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { loadRuntimeSource } = require("./sourceHarness.cjs");
const {
  NovelCorePipelineService,
} = require("../../dist/services/novel/novelCorePipelineService.js");

function createLeaseStore(db) {
  return {
    async updateMany({ where, data }) {
      let result;
      if (where.OR) {
        result = db.prepare(`
          UPDATE "GenerationJob"
          SET "executionOwner" = ?, "executionLeaseExpiresAt" = ?
          WHERE id = ?
            AND status IN ('queued', 'running')
            AND "pendingManualRecovery" = 0
            AND "cancelRequestedAt" IS NULL
            AND (
              "executionOwner" IS NULL
              OR "executionLeaseExpiresAt" < ?
              OR "executionOwner" = ?
            )
        `).run(
          data.executionOwner,
          data.executionLeaseExpiresAt.toISOString(),
          where.id,
          where.OR[1].executionLeaseExpiresAt.lt.toISOString(),
          data.executionOwner,
        );
      } else if (data.executionLeaseExpiresAt) {
        result = db.prepare(`
          UPDATE "GenerationJob"
          SET "executionLeaseExpiresAt" = ?
          WHERE id = ?
            AND "executionOwner" = ?
            AND "executionLeaseExpiresAt" > ?
            AND "executionLeaseExpiresAt" < ?
            AND status IN ('queued', 'running')
            AND "pendingManualRecovery" = 0
            AND "cancelRequestedAt" IS NULL
        `).run(
          data.executionLeaseExpiresAt.toISOString(),
          where.id,
          where.executionOwner,
          where.executionLeaseExpiresAt.gt.toISOString(),
          where.executionLeaseExpiresAt.lt.toISOString(),
        );
      } else {
        result = db.prepare(`
          UPDATE "GenerationJob"
          SET "executionOwner" = NULL, "executionLeaseExpiresAt" = NULL
          WHERE id = ? AND "executionOwner" = ?
        `).run(where.id, where.executionOwner);
      }
      return { count: Number(result.changes) };
    },
  };
}

test("pipeline execution lease: real SQLite claim is exclusive and an expired owner can be replaced", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE "GenerationJob" (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        "pendingManualRecovery" INTEGER NOT NULL DEFAULT 0,
        "cancelRequestedAt" TEXT
      );
      INSERT INTO "GenerationJob" (id, status) VALUES ('job-1', 'running');
      INSERT INTO "GenerationJob" (id, status, "pendingManualRecovery") VALUES ('job-paused', 'queued', 1);
    `);
    db.exec(fs.readFileSync(path.resolve(
      __dirname,
      "../../src/prisma/migrations.sqlite/20260907150000_pipeline_execution_lease/migration.sql",
    ), "utf8"));
    const { PipelineExecutionLeaseService } = loadRuntimeSource(
      "../production/executionLease/PipelineExecutionLeaseService.ts",
      { "../../../../db/prisma": { prisma: {} } },
    );
    const store = createLeaseStore(db);
    const left = new PipelineExecutionLeaseService(store);
    const right = new PipelineExecutionLeaseService(store);
    const startedAt = new Date("2026-09-07T00:00:00.000Z");

    const claims = await Promise.all([
      left.claim({ jobId: "job-1", ownerId: "owner-a", now: startedAt, leaseMs: 10_000 }),
      right.claim({ jobId: "job-1", ownerId: "owner-b", now: startedAt, leaseMs: 10_000 }),
    ]);
    assert.equal(claims.filter(Boolean).length, 1);
    const firstOwner = db.prepare('SELECT "executionOwner" FROM "GenerationJob" WHERE id=?').get("job-1").executionOwner;
    const nextOwner = firstOwner === "owner-a" ? "owner-b" : "owner-a";
    assert.equal(await left.release("job-1", "not-owner"), false);
    assert.equal(await left.renew({
      jobId: "job-1",
      ownerId: firstOwner,
      now: new Date("2026-09-07T00:00:11.000Z"),
    }), false);
    assert.equal(await right.claim({
      jobId: "job-1",
      ownerId: nextOwner,
      now: new Date("2026-09-07T00:00:11.000Z"),
      leaseMs: 10_000,
    }), true);
    assert.equal(
      db.prepare('SELECT "executionOwner" FROM "GenerationJob" WHERE id=?').get("job-1").executionOwner,
      nextOwner,
    );
    assert.equal(await left.renew({
      jobId: "job-1",
      ownerId: firstOwner,
      now: new Date("2026-09-07T00:00:12.000Z"),
    }), false);
    assert.equal(await right.renew({
      jobId: "job-1",
      ownerId: nextOwner,
      now: new Date("2026-09-07T00:00:12.000Z"),
    }), true);
    const latestExpiry = db.prepare(
      'SELECT "executionLeaseExpiresAt" FROM "GenerationJob" WHERE id=?',
    ).get("job-1").executionLeaseExpiresAt;
    assert.equal(await right.renew({
      jobId: "job-1",
      ownerId: nextOwner,
      now: new Date("2026-09-07T00:00:11.500Z"),
      leaseMs: 10_000,
    }), false);
    assert.equal(
      db.prepare('SELECT "executionLeaseExpiresAt" FROM "GenerationJob" WHERE id=?')
        .get("job-1").executionLeaseExpiresAt,
      latestExpiry,
    );
    assert.equal(await left.claim({ jobId: "job-paused", ownerId: "owner-c", now: startedAt }), false);
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
      .get("GenerationJob_status_executionLeaseExpiresAt_idx"));
  } finally {
    db.close();
  }
});

test("pipeline execution lease: ownership storage failure pauses before executor work", async () => {
  const service = new NovelCorePipelineService();
  const updates = [];
  let executions = 0;
  const { prisma } = require("../../dist/db/prisma.js");
  const originalUpdateMany = prisma.generationJob.updateMany;
  service.pipelineExecutionLeases = {
    async claim() {
      const error = new Error("missing execution lease columns");
      error.code = "P2022";
      throw error;
    },
  };
  service.pipelineExecutor = {
    async execute() { executions += 1; },
  };
  prisma.generationJob.updateMany = async (input) => {
    updates.push(input);
    return { count: 1 };
  };

  try {
    await service.executePipeline("job-1", "novel-1", { startOrder: 1, endOrder: 1 });

    assert.equal(executions, 0);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].where.id, "job-1");
    assert.equal(updates[0].where.OR, undefined);
    assert.equal(updates[0].data.pendingManualRecovery, true);
    assert.match(updates[0].data.error, /数据库迁移和连接/);
  } finally {
    prisma.generationJob.updateMany = originalUpdateMany;
  }
});

test("pipeline execution lease: non-schema claim failure does not pause a valid owner", async () => {
  const service = new NovelCorePipelineService();
  const updates = [];
  let executions = 0;
  const { prisma } = require("../../dist/db/prisma.js");
  const originalUpdateMany = prisma.generationJob.updateMany;
  service.pipelineExecutionLeases = {
    async claim() { throw new Error("temporary connection failure"); },
  };
  service.pipelineExecutor = {
    async execute() { executions += 1; },
  };
  prisma.generationJob.updateMany = async (input) => {
    updates.push(input);
    return { count: 0 };
  };

  try {
    await service.executePipeline("job-1", "novel-1", { startOrder: 1, endOrder: 1 });

    assert.equal(executions, 0);
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].where.OR[0], { executionOwner: null });
    assert.ok(updates[0].where.OR[1].executionLeaseExpiresAt.lt instanceof Date);
  } finally {
    prisma.generationJob.updateMany = originalUpdateMany;
  }
});
