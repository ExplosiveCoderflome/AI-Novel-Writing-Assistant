const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const server = path.resolve(__dirname, '../../..');
const requireServer = createRequire(path.join(server, 'package.json'));
let schemaSql;
function fullSchemaSql() {
  if (schemaSql) return schemaSql;
  const cli = path.join(path.dirname(requireServer.resolve('prisma/package.json')), 'build/index.js');
  const result = spawnSync(process.execPath, [cli, 'migrate', 'diff', '--from-empty', '--to-schema',
    path.join(server, 'src/prisma/schema.sqlite.prisma'), '--script'], {
    cwd: server, encoding: 'utf8', env: { ...process.env, DATABASE_URL: `file:${path.join(os.tmpdir(), 'unused-kernel-schema-diff.sqlite')}` },
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CREATE TABLE "ProductionUnitRun"/);
  return schemaSql = result.stdout;
}
async function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-consumers-'));
  const file = path.join(directory, 'isolated.sqlite');
  const Sqlite = requireServer('better-sqlite3');
  const sqlite = new Sqlite(file);
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = OFF');
  sqlite.exec('BEGIN;\n' + fullSchemaSql() + '\nCOMMIT;');
  sqlite.exec(`CREATE TABLE "KernelTestLease" ("id" INTEGER PRIMARY KEY, "active" INTEGER NOT NULL, "token" TEXT NOT NULL);
    INSERT INTO "KernelTestLease" VALUES (1, 1, 'lease-1');`);
  sqlite.close();
  const { PrismaClient } = requireServer('@prisma/client');
  const { PrismaBetterSqlite3 } = requireServer('@prisma/adapter-better-sqlite3');
  const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${file}` }) });
  t.after(async () => {
    await db.$disconnect();
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith('kernel-consumers-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const kernel = require('../../../dist/modules/production');
  await db.novel.create({ data: { id: 'novel-1', title: '测试书' } });
  await db.chapter.create({ data: { id: 'chapter-1', novelId: 'novel-1', title: '测试章', order: 1, content: '主角在城门交出钥匙，答应返回。' } });
  const content = (await db.chapter.findUnique({ where: { id: 'chapter-1' }, select: { content: true } })).content;
  const assertOwnership = async (tx, identity) => {
    const result = await tx.$executeRaw`UPDATE "KernelTestLease" SET "active" = "active" WHERE "id" = ${1} AND "active" = ${1} AND "token" = ${identity.executionToken ?? 'lease-1'}`;
    if (result !== 1) throw new Error('ownership lost');
  };
  const store = new kernel.PrismaUnitProgressStore(db, { assertOwnership });
  const req = require('../application/harness.cjs').request();
  let run = await store.loadOrCreate(req);
  const contentHash = kernel.hashProductionContent(content);
  run = await store.compareAndSwap(run, { progress: { ...run.progress, selected: 'original', selectedContentHash: contentHash, committedContentHash: contentHash },
    artifacts: { ...run.artifacts, original: content }, activeStage: 'reconcile', activeRequestKey: 'reconcile-request' });
  const context = { run, content, contentHash, executionToken: 'lease-1', requestKey: run.activeRequestKey };
  const checkpoints = new kernel.PrismaArtifactCheckpointStore(db, assertOwnership);
  const identity = name => ({ runId: run.id, ownerKey: run.ownerKey, novelId: req.unit.novelId, chapterId: req.unit.chapterId,
    contentHash, unitRequestKey: run.activeRequestKey, stepKey: `consumer-${name}`, step: name, executionToken: 'lease-1', kind: 'consumer' });
  return { db, kernel, context, checkpoints, identity, assertOwnership,
    revoke: () => db.$executeRaw`UPDATE "KernelTestLease" SET "active" = ${0} WHERE "id" = ${1}` };
}
module.exports = { setup, fullSchemaSql };
