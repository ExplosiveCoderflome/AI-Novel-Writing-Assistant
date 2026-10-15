const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("proposal, applied character state, snapshot and version link commit or roll back together", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "state-commit-atomic-"));
  const script = String.raw`
const assert = require("node:assert/strict");
const { prisma } = require("./dist/db/prisma");
const { ensureRuntimeDatabaseReady } = require("./dist/db/runtimeMigrations");
const { StateCommitService } = require("./dist/services/novel/state/StateCommitService");
(async () => {
  await ensureRuntimeDatabaseReady();
  await prisma.novel.create({data:{id:"n",title:"状态事务回归"}});
  await prisma.chapter.create({data:{id:"c",novelId:"n",order:1,title:"本章",content:"主角决定出发。"}});
  await prisma.character.create({data:{id:"hero",novelId:"n",name:"主角",role:"主角",currentState:"犹豫"}});
  const service = new StateCommitService();
  const proposal = {novelId:"n",chapterId:"c",proposalType:"character_state_update",sourceType:"chapter_background_sync",sourceStage:"test",
    riskLevel:"low",status:"validated",summary:"主角决定出发",payload:{characterId:"hero",currentState:"出发",currentGoal:"寻找同伴"},
    evidence:["主角决定出发。"],validationNotes:[]};
  const run = () => service.proposeAndCommit({novelId:"n",chapterId:"c",chapterOrder:1,skipFactExtraction:true,proposals:[proposal]});
  await prisma.$executeRawUnsafe('CREATE TRIGGER reject_version BEFORE INSERT ON "CanonicalStateVersion" BEGIN SELECT RAISE(ABORT, \'version unavailable\'); END;');
  await assert.rejects(run(), error => error.code === "P2003");
  assert.equal(await prisma.stateChangeProposal.count(),0);
  assert.equal(await prisma.canonicalStateVersion.count(),0);
  assert.equal((await prisma.character.findUniqueOrThrow({where:{id:"hero"}})).currentState,"犹豫");
  await prisma.$executeRawUnsafe('DROP TRIGGER reject_version');

  const pending = await prisma.stateChangeProposal.create({data:{novelId:"n",chapterId:"c",sourceType:"chapter_background_sync",proposalType:"character_state_update",
    riskLevel:"low",status:"pending_review",summary:proposal.summary,payloadJson:JSON.stringify(proposal.payload),evidenceJson:JSON.stringify(proposal.evidence)}});
  const confirm = () => service.commitExistingProposals({novelId:"n",chapterId:"c",chapterOrder:1,proposalIds:[pending.id],reason:"test"});
  await prisma.$executeRawUnsafe('CREATE TRIGGER reject_version_link BEFORE UPDATE OF "committedVersionId" ON "StateChangeProposal" WHEN NEW."committedVersionId" IS NOT NULL BEGIN SELECT RAISE(ABORT, \'link unavailable\'); END;');
  await assert.rejects(confirm(), error => error.code === "P2003");
  assert.equal((await prisma.stateChangeProposal.findUniqueOrThrow({where:{id:pending.id}})).status,"pending_review");
  assert.equal(await prisma.canonicalStateVersion.count(),0);
  assert.equal((await prisma.character.findUniqueOrThrow({where:{id:"hero"}})).currentState,"犹豫");
  await prisma.$executeRawUnsafe('DROP TRIGGER reject_version_link');
  await prisma.$executeRawUnsafe('CREATE TRIGGER reject_character BEFORE UPDATE ON "Character" BEGIN SELECT RAISE(ABORT, \'character unavailable\'); END;');
  await assert.rejects(confirm(), error => error.code === "P2003");
  assert.equal((await prisma.stateChangeProposal.findUniqueOrThrow({where:{id:pending.id}})).status,"pending_review");
  assert.equal(await prisma.canonicalStateVersion.count(),0);
  await prisma.$executeRawUnsafe('DROP TRIGGER reject_character');

  const result = await confirm();
  assert.equal(result.committed.length,1);
  const row = await prisma.stateChangeProposal.findUniqueOrThrow({where:{id:pending.id}});
  assert.equal(row.committedVersionId,result.versionRecord.id);
  assert.equal(row.status,"committed");
  const snapshot = JSON.parse(result.versionRecord.snapshotJson);
  assert.ok(JSON.stringify(snapshot).includes("出发"), "snapshot must see the transaction's newly applied state");
  assert.equal((await confirm()).committed.length,0);
  assert.equal(await prisma.canonicalStateVersion.count(),1);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
`;
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: path.resolve(__dirname, "../.."), encoding: "utf8", timeout: 120_000,
    env: { ...process.env, NODE_ENV: "test", AI_NOVEL_RUNTIME: "desktop", AI_NOVEL_APP_DATA_DIR: directory,
      DATABASE_URL: `file:${path.join(directory, "fixture.db").replace(/\\/g, "/")}` },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}\n${result.error ?? ""}`);
});
