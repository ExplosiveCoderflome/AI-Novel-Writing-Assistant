const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {initializeTemporarySqliteDatabase} = require('../testInfrastructure/tempSqliteDatabase.cjs');

test('V2 carries relevant earlier pending resources without future, stale or unrelated facts; V1 keeps its scope', () => {
  const server = path.resolve(__dirname, '../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-resource-context-'));
  const databaseUrl = initializeTemporarySqliteDatabase(dir, 'test.db');
  const script = path.join(dir, 'drill.cjs');
  fs.writeFileSync(script, String.raw`
const assert = require('node:assert/strict');
const path = require('node:path');
const server = process.env.TEST_SERVER_ROOT;
const {prisma} = require(path.join(server, 'dist/db/prisma'));
const {loadRuntimeSource} = require(path.join(server, 'tests/novelProduction/sourceHarness.cjs'));
const version = require(path.join(server, 'dist/services/novel/runtime/artifactSync/ChapterArtifactContentVersion'));
const shared = require(path.join(server, 'dist/services/novel/characterResource/characterResourceShared'));
const {CharacterResourceLedgerService} = loadRuntimeSource('../characterResource/CharacterResourceLedgerService.ts', {
  '../../../db/prisma': {prisma}, './characterResourceShared': shared,
  '../runtime/artifactSync': version,
});
(async () => {
  try {
    await prisma.novel.createMany({data:[{id:'n',title:'本书',directorVersion:'v2'},{id:'other',title:'别书'}]});
    await prisma.chapter.createMany({data:[
      {id:'past',novelId:'n',order:1,title:'前章',content:'甲把钥匙交给乙。'},
      {id:'current',novelId:'n',order:2,title:'本章',content:'乙开门。'},
      {id:'future',novelId:'n',order:3,title:'后章',content:'未来事件。'},
    ]});
    const add = async (id, chapterId, payload = {}, novelId = 'n') => prisma.stateChangeProposal.create({data:{
      id,novelId,chapterId,sourceType:'chapter_background_sync',proposalType:'character_resource_update',
      riskLevel:'low',status:'pending_review',summary:id,
      payloadJson:JSON.stringify({resourceKey:'key',resourceName:'钥匙',holderCharacterId:'hero',...payload}),
      evidenceJson:'["正文证据"]',
    }});
    await add('earlier','past',{syncContentHash:version.buildChapterArtifactContentHash('甲把钥匙交给乙。')});
    await add('current','current');
    await add('book',null);
    await add('future','future');
    await add('future-global',null,{chapterOrder:3});
    await add('stale','past',{syncContentHash:'an-obsolete-version'});
    await add('unrelated','past',{holderCharacterId:'outsider'});
    await add('other-book',null,{},'other');
    const service = new CharacterResourceLedgerService();
    const input = {chapterId:'current',chapterOrder:2,characterIds:['hero']};
    const context = await service.buildContext('n',{...input,includePreviousPending:true});
    assert.deepEqual(context.pendingProposalItems.map(x=>x.id).sort(),['book','current','earlier']);
    assert.equal(context.availableItems.length,0,'a pending change cannot become usable inventory');
    assert.equal(await prisma.stateChangeProposal.count({where:{status:'committed'}}),0,'reading cannot approve changes');
    const legacy = await service.buildContext('n',input);
    assert.deepEqual(legacy.pendingProposalItems.map(x=>x.id).sort(),['book','current','future-global']);

    for (let i=0;i<20;i++) await add('noise-'+i,'past',{holderCharacterId:'outsider'});
    const afterNoise = await service.buildContext('n',{...input,includePreviousPending:true});
    assert.deepEqual(afterNoise.pendingProposalItems.map(x=>x.id).sort(),['book','current','earlier']);
    for (let i=0;i<12;i++) await add('relevant-'+i,'past');
    const bounded = await service.buildContext('n',{...input,includePreviousPending:true});
    assert.equal(bounded.pendingProposalItems.length,8,'the prompt must remain bounded after filtering');
  } finally {await prisma.$disconnect();}
})().catch(error=>{console.error(error);process.exitCode=1;});
`);
  const result = execFileSync(process.execPath, [script], {env:{...process.env,
    TEST_SERVER_ROOT:server,NODE_ENV:'test',DATABASE_URL:databaseUrl,DATABASE_PROVIDER:'sqlite',
    AI_NOVEL_RUNTIME:'desktop',AI_NOVEL_APP_DATA_DIR:dir,
  },stdio:'pipe'});
  assert.ok(result !== undefined);
});
