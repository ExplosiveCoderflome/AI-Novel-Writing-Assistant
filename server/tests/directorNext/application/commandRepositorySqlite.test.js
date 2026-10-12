const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "../../../..");

test("Prisma command repository atomically records idempotent commands and handoff", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "director-next-command-"));
  const databasePath = path.join(tempDir, "commands.db");
  const scriptPath = path.join(tempDir, "command.cjs");
  fs.writeFileSync(scriptPath, String.raw`
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const repoRoot = process.env.DIRECTOR_NEXT_REPO_ROOT;
const serverRoot = path.join(repoRoot, "server");
const Database = require(require.resolve("better-sqlite3", { paths: [serverRoot] }));
const databasePath = process.env.DATABASE_URL.slice("file:".length);
const raw = new Database(databasePath);
const migrationRoot = path.join(serverRoot, "src/prisma/migrations.sqlite");
for (const name of fs.readdirSync(migrationRoot).filter((name) => name.startsWith("20261001")).sort()) {
  raw.exec(fs.readFileSync(path.join(migrationRoot, name, "migration.sql"), "utf8"));
}
raw.close();
const { prisma } = require(path.join(serverRoot, "dist/db/prisma"));
const { PrismaRunRepository, PrismaCommandRepository } = require(path.join(serverRoot, "dist/modules/director/infrastructure"));
const { CommandService } = require(path.join(serverRoot, "dist/modules/director/application"));
const { contract } = require(path.join(serverRoot, "tests/directorNext/fixtures"));

(async () => {
  let sequence = 0;
  const runRepository = new PrismaRunRepository(prisma);
  const commandRepository = new PrismaCommandRepository(prisma);
  const service = new CommandService({
    runRepository,
    commandRepository,
    runtime: { nextId: () => "id-" + (++sequence) },
    contractFactory: ({ runId, novelId, driver, stepIdsInScope }) => contract({ runId, novelId, driver, stepIdsInScope }),
    prepareOpen: async () => [{type: 'novel_seed', scope: 'book', status: 'confirmed', protectedUserContent: true, contentRef: 'novel:novel-1', contentHash: 'seed-hash'}],
  });
  const first = await service.execute({ type: "open_run", novelId: "novel-1", driver: "auto", stepIdsInScope: null, idempotencyKey: "open-1" });
  const replay = await service.execute({ type: "open_run", novelId: "novel-1", driver: "auto", stepIdsInScope: null, idempotencyKey: "open-1" });
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.runId, first.runId);
  assert.equal(await prisma.directorNextCommand.count(), 1);
  assert.equal(await prisma.directorNextRun.count(), 1);
  assert.equal(await prisma.directorNextArtifact.count(), 1);
  assert.equal((await prisma.directorNextArtifact.findFirst()).producedByRunId, first.runId);

  await assert.rejects(
    () => service.execute({ type: "open_run", novelId: "novel-1", driver: "auto", stepIdsInScope: null, idempotencyKey: "open-2" }),
    (error) => error.name === "ActiveRunConflictError",
  );

  const cancelled = await service.execute({ type: "cancel", runId: first.runId, expectedVersion: 0, idempotencyKey: "cancel-1" });
  const cancelReplay = await service.execute({ type: "cancel", runId: first.runId, expectedVersion: 0, idempotencyKey: "cancel-1" });
  assert.equal(cancelled.controlVersion, 1);
  assert.equal(cancelReplay.replayed, true);
  assert.equal((await runRepository.getControl(first.runId)).status, "cancelled");

  const second = await service.execute({ type: "open_run", novelId: "novel-1", driver: "auto", stepIdsInScope: ["story_macro"], idempotencyKey: "open-3" });
  const artifactsBeforeHandoff = await prisma.directorNextArtifact.findMany();
  const handoff = await service.execute({ type: "handoff", runId: second.runId, toDriver: "assisted", expectedVersion: 0, idempotencyKey: "handoff-1" });
  assert.equal((await runRepository.getControl(second.runId)).status, "cancelled");
  assert.equal((await runRepository.getContract(handoff.runId)).driver, "assisted");
  assert.equal((await runRepository.getContract(handoff.runId)).stepIdsInScope[0], "story_macro");
  assert.equal((await runRepository.getControl(handoff.runId)).status, "queued");
  assert.equal(await prisma.directorNextCommand.count(), 4);
  assert.deepEqual(await prisma.directorNextArtifact.findMany(), artifactsBeforeHandoff);
  const switchedContract = await runRepository.getContract(handoff.runId);
  await runRepository.transition(handoff.runId, {type: 'start'}, 0);
  await runRepository.transition(handoff.runId, {type: 'step_started', stepId: 'story_macro'}, 1);
  const duringStep = await prisma.directorNextRunControl.findUniqueOrThrow({where: {runId: handoff.runId}});
  await assert.rejects(service.execute({type: 'handoff', runId: handoff.runId, toDriver: 'auto', expectedVersion: 2, idempotencyKey: 'switch-during-step'}), error => error.statusCode === 400);
  assert.deepEqual(await prisma.directorNextRunControl.findUniqueOrThrow({where: {runId: handoff.runId}}), duringStep);
  assert.equal(await prisma.directorNextCommand.count({where: {idempotencyKey: 'switch-during-step'}}), 0);
  await runRepository.transition(handoff.runId, {type: 'step_finished'}, 2);
  const back = await service.execute({type: 'handoff', runId: handoff.runId, toDriver: 'auto', expectedVersion: 3, idempotencyKey: 'switch-back'});
  const backContract = await runRepository.getContract(back.runId);
  assert.deepEqual(backContract, {...switchedContract, runId: back.runId, driver: 'auto'});
  assert.deepEqual(await prisma.directorNextArtifact.findMany(), artifactsBeforeHandoff);
  assert.equal(await prisma.directorNextRunControl.count({where: {novelId: 'novel-1', status: {in: ['queued', 'running', 'paused', 'waiting_gate']}}}), 1);
  assert.equal((await service.execute({type: 'handoff', runId: handoff.runId, toDriver: 'auto', expectedVersion: 3, idempotencyKey: 'switch-back'})).replayed, true);
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
