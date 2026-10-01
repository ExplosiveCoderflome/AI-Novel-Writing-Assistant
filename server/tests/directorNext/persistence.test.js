const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..", "..");
const serverRoot = path.join(repoRoot, "server");

function runPersistenceScenario() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "director-next-persistence-"));
  const databasePath = path.join(tempDir, "director-next.db");
  const scriptPath = path.join(tempDir, "scenario.cjs");
  const script = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const repoRoot = process.env.DIRECTOR_NEXT_REPO_ROOT;
const serverRoot = path.join(repoRoot, "server");
const Database = require(require.resolve("better-sqlite3", { paths: [serverRoot] }));
const { PrismaBetterSqlite3 } = require(require.resolve("@prisma/adapter-better-sqlite3", { paths: [serverRoot] }));
const { PrismaClient } = require(require.resolve("@prisma/client", { paths: [serverRoot] }));
const databaseUrl = process.env.DIRECTOR_NEXT_DATABASE_URL;
const databasePath = databaseUrl.slice("file:".length);
const raw = new Database(databasePath);
const migrationRoot = path.join(serverRoot, "src/prisma/migrations.sqlite");
for (const name of fs.readdirSync(migrationRoot).filter((entry) => entry.startsWith("20261001")).sort()) {
  raw.exec(fs.readFileSync(path.join(migrationRoot, name, "migration.sql"), "utf8"));
}
raw.close();
process.env.DATABASE_URL = databaseUrl;
const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });
const infrastructure = require(path.join(serverRoot, "dist/modules/director/infrastructure"));
const contract = {
  runId: "run-1",
  novelId: "novel-1",
  driver: "auto",
  planVersion: "p1",
  scope: "book",
  stepIdsInScope: null,
  chapterRange: null,
  issuePolicy: { mode: "completion_first", version: "ip1" },
  modelConfig: { route: "default", model: "test", version: "m1" },
  tokenBudget: null,
  rejectionBudget: 2,
};

(async () => {
  const runs = new infrastructure.PrismaRunRepository(db);
  const artifacts = new infrastructure.PrismaArtifactLedger(db);
  const debts = new infrastructure.PrismaQualityDebtRepository(db);
  const events = new infrastructure.PrismaEventLog(db);
  assert.equal((await runs.open(contract)).status, "queued");
  await assert.rejects(() => runs.open({ ...contract, runId: "run-2" }));
  assert.equal((await runs.getContract("run-1")).runId, "run-1");
  assert.equal((await runs.transition("run-1", { type: "start" }, 0)).status, "running");
  await assert.rejects(() => runs.transition("run-1", { type: "complete" }, 0), (error) => error.name === "VersionConflictError");

  const now = new Date("2026-10-01T00:00:00.000Z");
  assert.equal(await runs.acquireLease("run-1", "worker-a", new Date("2026-10-01T00:00:10.000Z"), now), true);
  assert.equal(await runs.acquireLease("run-1", "worker-b", new Date("2026-10-01T00:00:20.000Z"), new Date("2026-10-01T00:00:01.000Z")), false);
  assert.deepEqual(await runs.listExpiredLeases(new Date("2026-10-01T00:00:11.000Z")), ["run-1"]);
  assert.equal(await runs.heartbeat("run-1", "worker-a", new Date("2026-10-01T00:00:20.000Z"), new Date("2026-10-01T00:00:11.000Z")), false);

  const artifactInput = { novelId: "novel-1", type: "story_macro", scope: "book", status: "confirmed", protectedUserContent: false, contentHash: null, producedByRunId: "run-1" };
  await artifacts.record({ ...artifactInput, contentRef: "macro-v1" });
  await artifacts.record({ ...artifactInput, status: "draft", contentRef: "macro-v2" });
  await artifacts.record({ ...artifactInput, type: "chapter_draft", scope: "chapter:1", contentRef: "chapter-v1" });
  const artifactRefs = await artifacts.listByNovel("novel-1");
  assert.equal(artifactRefs.filter((entry) => entry.type === "story_macro").length, 2);
  assert.deepEqual(artifactRefs.filter((entry) => entry.type === "story_macro").map((entry) => entry.version).sort((a, b) => a - b), [1, 2]);
  assert.equal(await artifacts.markStale("novel-1", ["story_macro", "chapter_draft"]), 2);
  await debts.record({ novelId: "novel-1", runId: "run-1", chapterOrder: 1, code: "gap", action: "continue" });
  assert.deepEqual(await debts.listByNovel("novel-1"), [{ chapterOrder: 1, code: "gap" }]);

  await Promise.all(Array.from({ length: 8 }, (_, index) => events.append({ runId: "run-1", type: "event-" + index, payload: { index } })));
  assert.deepEqual((await events.list("run-1")).map((entry) => entry.seq), [1, 2, 3, 4, 5, 6, 7, 8]);
  await db.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
`;
  fs.writeFileSync(scriptPath, script, "utf8");
  childProcess.execFileSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DIRECTOR_NEXT_REPO_ROOT: repoRoot,
      DIRECTOR_NEXT_DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`,
    },
    stdio: "pipe",
  });
}

test("director next repositories persist facts and enforce concurrency rules", () => {
  assert.doesNotThrow(runPersistenceScenario);
});
