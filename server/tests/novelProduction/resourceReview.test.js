const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {initializeTemporarySqliteDatabase} = require('../testInfrastructure/tempSqliteDatabase.cjs');

test('unified V2 resource review commits ordinary loss, respects hold and fences unsafe changes without another AI call', () => {
  const server = path.resolve(__dirname, '../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-resource-review-'));
  const databaseUrl = initializeTemporarySqliteDatabase(dir, 'test.db');
  const script = path.join(dir, 'drill.cjs');
  fs.writeFileSync(script, String.raw`
const assert = require('node:assert/strict');
const path = require('node:path');
const server = process.env.TEST_SERVER_ROOT;
const {prisma} = require(path.join(server,'dist/db/prisma'));
const {loadRuntimeSource} = require(path.join(server,'tests/novelProduction/sourceHarness.cjs'));
const version = require(path.join(server,'dist/services/novel/runtime/artifactSync/ChapterArtifactContentVersion'));
const {StateCommitService} = loadRuntimeSource('../state/StateCommitService.ts',{
  '@ai-novel/shared/types/characterResource':require(path.join(server,'../shared/dist/types/characterResource')),
  '../../../db/prisma':{prisma}, '../runtime/artifactSync':version,
  '../runtime/artifactSync/ChapterArtifactSyncResult':require(path.join(server,'dist/services/novel/runtime/artifactSync/ChapterArtifactSyncResult')),
  '../characterResource/CharacterResourceLedgerService':require(path.join(server,'dist/services/novel/characterResource/CharacterResourceLedgerService')),
  '../characterResource/characterResourceShared':require(path.join(server,'dist/services/novel/characterResource/characterResourceShared')),
  '../characterResource/CharacterResourceValidationService':require(path.join(server,'dist/services/novel/characterResource/CharacterResourceValidationService')),
  './CanonicalStateService':require(path.join(server,'dist/services/novel/state/CanonicalStateService')),
  './ChapterFactExtractor':{chapterFactExtractor:{extract:async()=>{throw Error('another model call is forbidden');}}},
  './StateVersionLog':require(path.join(server,'dist/services/novel/state/StateVersionLog')),
  './stateProposalSourceQuality':require(path.join(server,'dist/services/novel/state/stateProposalSourceQuality')),
});
(async()=>{try {
  await prisma.novel.createMany({data:[{id:'n',title:'本书',directorVersion:'v2'},{id:'v1',title:'旧书',directorVersion:'v1'}]});
  await prisma.chapter.createMany({data:[{id:'c',novelId:'n',order:1,title:'本章',content:'甲丢失了钥匙。'},{id:'v1c',novelId:'v1',order:1,title:'旧章',content:'旧正文。'}]});
  const service = new StateCommitService();
  const make = (key, overrides={}) => {
    const {payload={},...rest}=overrides;
    return {novelId:'n',chapterId:'c',sourceType:'chapter_artifact_delta',proposalType:'character_resource_update',riskLevel:'low',status:'validated',summary:'钥匙丢失',
      payload:{resourceKey:key,resourceName:'钥匙',chapterOrder:1,resourceType:'physical_item',narrativeFunction:'key',updateType:'lost',ownerType:'unknown',statusAfter:'lost',
        visibilityAfter:{readerKnows:true,holderKnows:true,knownByCharacterIds:[]},narrativeImpact:'不能再开门',constraints:[],confidence:0.95,
        syncContentHash:version.buildChapterArtifactContentHash('甲丢失了钥匙。'),...payload},evidence:['甲丢失了钥匙。'],validationNotes:[],...rest};
  };
  const run = (proposal,decision='commit',overrides={}) => service.proposeAndCommit({novelId:'n',chapterId:'c',chapterOrder:1,skipFactExtraction:true,
    expectedChapterContent:'甲丢失了钥匙。',proposals:[proposal],artifactResourceReview:{approvedResourceKeys:decision==='commit'?[proposal.payload.resourceKey]:[],pendingResourceKeys:decision==='hold'?[proposal.payload.resourceKey]:[]},...overrides});
  const ordinary = await run(make('ordinary'));
  assert.equal(ordinary.committed.length,1,'an explicit AI decision must avoid a separate resource review call');
  assert.equal((await prisma.characterResourceLedgerItem.findUnique({where:{novelId_resourceKey:{novelId:'n',resourceKey:'ordinary'}}})).status,'lost');
  assert.ok(ordinary.versionRecord,'automatic approval must use canonical version history');
  const held=await run(make('held',{payload:{updateType:'acquired',statusAfter:'available'}}),'hold');
  assert.equal(held.pendingReview.length,1,'hold overrides the otherwise automatic acquisition');
  assert.equal((await run(make('missing-decision',{payload:{updateType:'acquired',statusAfter:'available'}}),'absent')).pendingReview.length,1,'missing review decisions must not implicitly approve resources');
  assert.equal((await run(make('high',{riskLevel:'high'}))).pendingReview.length,1);
  assert.equal((await run(make('uncertain',{payload:{confidence:0.2}}))).pendingReview.length,1);
  assert.equal((await run(make('no-evidence',{evidence:[]}))).rejected.length,1);
  assert.equal((await run(make('old-hash',{payload:{syncContentHash:'obsolete'}}))).rejected.length,1);
  await prisma.characterResourceLedgerItem.create({data:{novelId:'n',resourceKey:'conflict',name:'钥匙',summary:'钥匙已毁',resourceType:'physical_item',narrativeFunction:'key',status:'destroyed',ownerType:'unknown',readerKnows:true,holderKnows:true}});
  const conflict=await run(make('conflict',{payload:{updateType:'acquired',statusAfter:'available'}}));
  assert.equal(conflict.pendingReview.length,1);
  assert.equal((await prisma.characterResourceLedgerItem.findUnique({where:{novelId_resourceKey:{novelId:'n',resourceKey:'conflict'}}})).status,'destroyed');
  const before=await prisma.stateChangeProposal.count();
  await assert.rejects(run(make('wrong-version',{novelId:'v1',chapterId:'v1c'}),'commit',{novelId:'v1',chapterId:'v1c',expectedChapterContent:'旧正文。'}),/V2/);
  assert.equal(await prisma.stateChangeProposal.count(),before);
  const legacy=await service.proposeAndCommit({novelId:'n',chapterId:'c',chapterOrder:1,skipFactExtraction:true,expectedChapterContent:'甲丢失了钥匙。',proposals:[make('legacy')]});
  assert.equal(legacy.pendingReview.length,1,'callers without V2 authority keep the old validation policy');
  const {chapterArtifactDeltaOutputSchema}=require(path.join(server,'dist/prompting/prompts/novel/chapterArtifactDelta.prompts'));
  const {ChapterArtifactDeltaService}=require(path.join(server,'dist/services/novel/runtime/ChapterArtifactDeltaService'));
  const output=chapterArtifactDeltaOutputSchema.parse({summary:'甲丢失钥匙。',stateDeltas:{},syncPlan:{reason:'按正文变化入账'},confidence:0.95,
    characterResourceDeltas:[{resourceName:'备用钥匙',holderCharacterName:null,ownerType:'unknown',resourceType:'physical_item',narrativeFunction:'key',updateType:'lost',statusAfter:'lost',
      narrativeImpact:'失去开门手段',readerKnows:true,holderKnows:true,knownByCharacterNames:[],constraints:[],evidence:['甲丢失了钥匙。'],riskLevel:'low',confidence:0.95,reviewDecision:'commit'}]});
  assert.equal(output.characterResourceDeltas[0].reviewDecision,'commit','the wire schema must preserve the AI decision');
  const delta=new ChapterArtifactDeltaService();
  const input={novelId:'n',chapterId:'c',content:'甲丢失了钥匙。',contentHash:version.buildChapterArtifactContentHash('甲丢失了钥匙。'),consumer:'character_resources',artifactSyncPolicy:'director_v2',output};
  assert.equal((await delta.applyChapterArtifactConsumer(input)).canonicalCommittedCount,1,'V2 must forward the unified decision to the commit boundary');
  const applied=await prisma.stateChangeProposal.count();
  assert.equal((await delta.applyChapterArtifactConsumer(input)).canonicalCommittedCount,0);
  assert.equal(await prisma.stateChangeProposal.count(),applied,'the same content version cannot create duplicate proposals on recovery');
} finally {await prisma.$disconnect();}})().catch(error=>{console.error(error);process.exitCode=1;});
`);
  execFileSync(process.execPath,[script],{env:{...process.env,TEST_SERVER_ROOT:server,NODE_ENV:'test',DATABASE_URL:databaseUrl,DATABASE_PROVIDER:'sqlite',AI_NOVEL_RUNTIME:'desktop',AI_NOVEL_APP_DATA_DIR:dir},stdio:'pipe'});
});
