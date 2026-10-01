const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "../../../..");

test("repeated fact and dashboard reads preserve every director fact column", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "director-next-read-only-"));
  const databasePath = path.join(tempDir, "facts.db");
  const scriptPath = path.join(tempDir, "read.cjs");
  fs.writeFileSync(scriptPath, String.raw`
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const serverRoot = path.join(process.env.DIRECTOR_NEXT_REPO_ROOT, "server");
const Database = require(require.resolve("better-sqlite3", { paths: [serverRoot] }));
const databasePath = process.env.DATABASE_URL.slice("file:".length);
const database = new Database(databasePath);
const migrations = path.join(serverRoot, "src/prisma/migrations.sqlite");
for (const name of fs.readdirSync(migrations).filter((name) => name.includes("_director_next_")).sort()) {
  database.exec(fs.readFileSync(path.join(migrations, name, "migration.sql"), "utf8"));
}
database.close();
const { prisma } = require(path.join(serverRoot, "dist/db/prisma"));
const { PrismaRunRepository, PrismaArtifactLedger, PrismaQualityDebtRepository, PrismaEventLog } = require(path.join(serverRoot, "dist/modules/director/infrastructure"));
const { FactsLoader, ProjectionService } = require(path.join(serverRoot, "dist/modules/director/application"));
const { plan, contract } = require(path.join(serverRoot, "tests/directorNext/fixtures"));

function snapshot() {
  const database = new Database(databasePath, { readonly: true });
  try {
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'DirectorNext%' ORDER BY name").all();
    return tables.map(({ name }) => ({ name, rows: database.prepare('SELECT * FROM "' + name + '" ORDER BY rowid').all() }));
  } finally {
    database.close();
  }
}

(async () => {
  const runRepository = new PrismaRunRepository(prisma);
  const artifactLedger = new PrismaArtifactLedger(prisma);
  const qualityDebtRepository = new PrismaQualityDebtRepository(prisma);
  const eventLog = new PrismaEventLog(prisma);
  await runRepository.open(contract({ issuePolicy: { mode: "quality_first", version: "policy-1" } }));
  await runRepository.transition("run-1", { type: "start" }, 0);
  await runRepository.transition("run-1", { type: "pause", pause: { kind: "manual_recovery", reason: "quality_first_pause" } }, 1);
  await artifactLedger.record({ novelId: "novel-1", type: "story_macro", scope: "book", status: "draft", protectedUserContent: false, contentRef: "macro-v1", contentHash: null, producedByRunId: "run-1" });
  await artifactLedger.record({ novelId: "novel-1", type: "chapter_draft", scope: "chapter:1", status: "user_edited", protectedUserContent: true, contentRef: "chapter-v1", contentHash: "user-content", producedByRunId: "run-1" });
  await qualityDebtRepository.record({ novelId: "novel-1", runId: "run-1", chapterOrder: 1, code: "local_gap", action: "pause_for_manual" });
  await eventLog.append({ runId: "run-1", type: "stop_signal", payload: { kind: "manual_recovery", reason: "quality_first_pause", action: "pause_for_manual" } });
  const factsLoader = new FactsLoader({ runRepository, artifactLedger, qualityDebtRepository, eventLog });
  const projection = new ProjectionService({ factsLoader, planRegistry: { get: (version) => version === plan.version ? plan : null } });
  const before = snapshot();
  for (let index = 0; index < 3; index += 1) {
    const view = await projection.get("run-1");
    assert.equal(view.mode, "paused");
    assert.equal(view.sourceRoute, "/novels/novel-1");
    assert.deepEqual(view.progress, { done: 1, total: 4, source: "artifact_ledger" });
    assert.deepEqual(view.debts, { count: 1, chapterOrders: [1] });
    assert.deepEqual(view.availableActions.map((action) => action.command), ["resume", "cancel"]);
    assert.equal((await factsLoader.load("run-1")).facts.stopSignal.kind, "manual_recovery");
  }
  assert.deepEqual(snapshot(), before);
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
`, "utf8");
  execFileSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: "test",
      DIRECTOR_NEXT_REPO_ROOT: repoRoot,
      DATABASE_URL: `file:${databasePath.replace(/\\/g, "/")}`,
    },
    stdio: "pipe",
  });
});
