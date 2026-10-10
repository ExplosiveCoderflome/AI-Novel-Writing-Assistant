const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {initializeTemporarySqliteDatabase} = require('../testInfrastructure/tempSqliteDatabase.cjs');

test('V2 appearances bind new identities after review, reuse extraction and reject stale content without touching V1', () => {
  const server = path.resolve(__dirname, '../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-appearances-'));
  const databaseUrl = initializeTemporarySqliteDatabase(dir, 'test.db');
  const script = path.join(dir, 'check.cjs');
  fs.writeFileSync(script, String.raw`
const assert = require('node:assert/strict');
const path = require('node:path');
const load = p => require(path.join(process.env.TEST_SERVER_ROOT, 'dist', p));
const {prisma} = load('db/prisma');
const {characterAppearanceService: service, CHARACTER_APPEARANCE_ARTIFACT: artifactType} = load('services/novel/characters/appearances');
const {DirectorCharacterCandidateService} = load('services/novel/characters/candidates');
const {ChapterArtifactRecoveryService} = load('services/novel/runtime/artifactSync/ChapterArtifactRecoveryService');
const {chapterArtifactDeltaOutputSchema} = load('prompting/prompts/novel/chapterArtifactDelta.prompts');
const {buildContentHash, ChapterArtifactDeltaService, getChapterArtifactConsumers} = load('services/novel/runtime/ChapterArtifactDeltaService');
load('prompting/core/promptRunner').runStructuredPrompt = async () => {throw Error('No model calls permitted');};
const content = '青禾打开药铺。她想起幼时师父的授课。听说阿宁回城了。阿宁推门进来递出药箱。';
const candidate = {proposedName:'阿宁', proposedRole:'药童', summary:'送药的药童', evidence:['阿宁推门进来递出药箱。'], identityDecision:'create', decisionReason:'独立参与剧情'};
const appearances = [
  {characterId:'qing',characterName:'青禾',kind:'present',summary:'开门',evidence:'青禾打开药铺。'},
  {characterId:'master',characterName:'师父',kind:'flashback',summary:'幼时授课',evidence:'她想起幼时师父的授课。'},
  {characterId:'',characterName:'阿宁',kind:'mention',summary:'听说回城',evidence:'听说阿宁回城了。'},
  {characterId:'',characterName:'阿宁',kind:'present',summary:'递来药箱',evidence:'阿宁推门进来递出药箱。'},
];
async function book(id,driver) {
  await prisma.novel.create({data:{id,title:id,directorVersion:'v2',directorEpoch:2}});
  const runId=id+'-run';
  await prisma.directorNextRun.create({data:{id:runId,novelId:id,driver,planVersion:'test',contractJson:JSON.stringify({runId,novelId:id,driver,executionEpoch:2})}});
  await prisma.directorNextRunControl.create({data:{runId,novelId:id,status:'running'}});
  await prisma.chapter.create({data:{id:id+'-c',novelId:id,order:1,title:'药铺',content}});
  return {novelId:id,chapterId:id+'-c',content,contentHash:buildContentHash(content),directorRunId:runId,artifactSyncMode:'adaptive',artifactSyncPolicy:'director_v2'};
}
const output = (rows, candidates=[]) => chapterArtifactDeltaOutputSchema.parse({summary:'本章',stateDeltas:{},syncPlan:{reason:'章末'},confidence:.9,characterAppearances:rows,characterCandidates:candidates});
(async()=>{try {
  const input=await book('auto','auto');
  await prisma.character.createMany({data:[{id:'qing',novelId:'auto',name:'青禾',role:'主角'},{id:'master',novelId:'auto',name:'师父',role:'师父'}]});
  const original=output(appearances,[candidate]);
  let extractions=0, failOnce=true;
  const real=new ChapterArtifactDeltaService();
  const recovery=new ChapterArtifactRecoveryService({deltaService:{
    extractChapterArtifacts:async()=>{extractions++;return {contentHash:input.contentHash,output:original};},
    applyChapterArtifactConsumer:async value=>{
      if(value.consumer!=='character_appearances') return {};
      if(failOnce){failOnce=false;throw Error('interrupted before appearance write');}
      return real.applyChapterArtifactConsumer(value);
    },toSyncResult:(extraction,aggregate)=>({...extraction,...aggregate})}});
  assert.ok(!getChapterArtifactConsumers({}).includes('character_appearances'));
  await assert.rejects(recovery.syncChapterArtifacts(input),/interrupted before appearance/);
  const newCharacter=await prisma.character.findFirst({where:{novelId:'auto',name:'阿宁'}});
  assert.ok(newCharacter,'new identity must exist before appearance consumer');
  await recovery.syncChapterArtifacts(input);
  await recovery.syncChapterArtifacts(input);
  assert.equal(extractions,1);
  assert.equal(await prisma.chapterArtifactSyncCheckpoint.count({where:{artifactType,novelId:'auto'}}),1);
  let page=await service.read('auto',newCharacter.id);
  assert.deepEqual(page.chapters[0].events.map(r=>r.kind),['mention','present']);
  assert.equal(page.chapters[0].events[1].characterId,newCharacter.id);
  assert.equal(page.chapters[0].chapterId,'auto-c');
  assert.equal((await service.read('auto','master')).chapters[0].events[0].kind,'flashback');
  // Planned appearances are projections of the latest non-stale chapter task, never a whole-cast rebuild.
  await prisma.chapter.create({data:{id:'future',novelId:'auto',order:2,title:'下一章'}});
  await prisma.storyPlan.createMany({data:[
    {id:'old-plan',novelId:'auto',chapterId:'future',level:'chapter',title:'旧计划',objective:'旧',participantsJson:'["阿宁"]',updatedAt:new Date(1000)},
    {id:'new-plan',novelId:'auto',chapterId:'future',level:'chapter',title:'新计划',objective:'新',participantsJson:'["青禾"]',updatedAt:new Date(2000)},
    {id:'stale-plan',novelId:'auto',chapterId:'future',level:'chapter',title:'失效计划',objective:'失效',participantsJson:'["阿宁"]',status:'stale',updatedAt:new Date(3000)},
  ]});
  assert.equal((await service.read('auto','qing')).chapters[1].planned,true);
  assert.equal((await service.read('auto',newCharacter.id)).chapters[1].planned,false);
  assert.equal((await service.read('auto','qing')).chapters[1].coverage,'unwritten');
  const before=await prisma.chapterArtifactSyncCheckpoint.count();
  await service.read('auto','qing');
  const all=await service.readNovel('auto');
  assert.equal(all.novelId,'auto');
  assert.equal(all.chapters.length,2);
  assert.deepEqual(all.chapters[1].plannedCharacterIds,['qing']);
  assert.equal(all.chapters[0].events.length,4,'all cast events share one chapter projection');
  for(const id of ['qing','master',newCharacter.id]) {
    const single=await service.read('auto',id);
    assert.deepEqual(single.chapters,all.chapters.map(({plannedCharacterIds,...chapter})=>({...chapter,
      planned:plannedCharacterIds.includes(id),events:chapter.events.filter(event=>event.characterId===id)})));
  }
  assert.equal(await prisma.chapterArtifactSyncCheckpoint.count(),before,'read cannot rebuild or call models');
  await assert.rejects(service.read('auto','foreign'),/本书/);
  await prisma.chapter.update({where:{id:'auto-c'},data:{content:content+'正文已修订。'}});
  assert.equal((await service.read('auto','qing')).chapters[0].coverage,'untracked');
  assert.equal((await service.read('auto','qing')).chapters[0].events.length,0);
  const revised=await service.readNovel('auto');
  assert.equal(revised.chapters[0].coverage,'untracked');
  assert.equal(revised.chapters[0].events.length,0);
  await assert.rejects(service.applyFinalChapter({...input,appearances}),/正文/);
  await prisma.chapter.update({where:{id:'auto-c'},data:{content}});
  await service.applyFinalChapter({...input,appearances:[{...appearances[0],evidence:'伪造证据'},{...appearances[0],characterId:'foreign'}]});
  page=await service.read('auto','qing');
  assert.equal(page.chapters[0].coverage,'untracked');
  assert.equal(page.chapters[0].events.length,0);
  await prisma.novel.update({where:{id:'auto'},data:{directorVersion:'v1',directorEpoch:3}});
  await assert.rejects(service.readNovel('auto'),/V2|v2|归属|导演/);
  await assert.rejects(service.applyFinalChapter({...input,appearances}),/归属/);

  // Assisted confirmation creates/binds the first appearance from the durable extraction, with no second call.
  const assisted=await book('assisted','assisted');
  const extracted=output(appearances.filter(r=>r.characterName==='阿宁'),[candidate]);
  const candidates=new DirectorCharacterCandidateService();
  let count=0;
  const assistedRecovery=new ChapterArtifactRecoveryService({deltaService:{
    extractChapterArtifacts:async()=>{count++;return {contentHash:assisted.contentHash,output:extracted};},
    applyChapterArtifactConsumer:async value=>value.consumer==='character_appearances'?real.applyChapterArtifactConsumer(value):{},
    toSyncResult:extraction=>extraction}});
  await assert.rejects(assistedRecovery.syncChapterArtifacts(assisted),error=>error.name==='CharacterCandidateReviewRequiredError');
  assert.equal(await prisma.chapterArtifactSyncCheckpoint.count({where:{artifactType,novelId:'assisted'}}),0);
  await prisma.directorNextRunControl.update({where:{runId:assisted.directorRunId},data:{status:'paused'}});
  let review=(await candidates.read(assisted.directorRunId)).reviews[0];
  await candidates.resolve(assisted.directorRunId,{reviewId:review.id,revision:review.revision,contentHash:review.contentHash,decisions:[{candidateId:review.items[0].id,action:'create'}]});
  const added=await prisma.character.findFirst({where:{novelId:'assisted',name:'阿宁'}});
  assert.equal((await service.read('assisted',added.id)).chapters[0].events.length,2);
  await prisma.directorNextRunControl.update({where:{runId:assisted.directorRunId},data:{status:'running'}});
  await assistedRecovery.syncChapterArtifacts(assisted);
  assert.equal(count,1);
  assert.equal(await prisma.chapterArtifactSyncCheckpoint.count({where:{artifactType,novelId:'assisted'}}),1);

  // Uncertain auto-mode identities do not count as reviewed absence; a later confirmation binds stored evidence.
  const deferred=await book('deferred','auto');
  const deferredOutput=output(appearances.filter(r=>r.characterName==='阿宁'),[{...candidate,identityDecision:'defer'}]);
  let deferredCalls=0;
  const deferredRecovery=new ChapterArtifactRecoveryService({deltaService:{
    extractChapterArtifacts:async()=>{deferredCalls++;return {contentHash:deferred.contentHash,output:deferredOutput};},
    applyChapterArtifactConsumer:async value=>value.consumer==='character_appearances'?real.applyChapterArtifactConsumer(value):{},
    toSyncResult:extraction=>extraction}});
  await prisma.character.create({data:{id:'deferred-known',novelId:'deferred',name:'青禾',role:'主角'}});
  await deferredRecovery.syncChapterArtifacts(deferred);
  assert.equal((await service.read('deferred','deferred-known')).chapters[0].coverage,'untracked');
  await prisma.directorNextRunControl.update({where:{runId:deferred.directorRunId},data:{status:'completed'}});
  review=(await candidates.read(deferred.directorRunId)).reviews[0];
  await candidates.resolve(deferred.directorRunId,{reviewId:review.id,revision:review.revision,contentHash:review.contentHash,decisions:[{candidateId:review.items[0].id,action:'create'}]});
  const confirmed=await prisma.character.findFirst({where:{novelId:'deferred',name:'阿宁'}});
  assert.equal((await service.read('deferred',confirmed.id)).chapters[0].events.length,2);
  assert.equal(deferredCalls,1);
  await prisma.directorNextRun.create({data:{id:'replacement',novelId:'assisted',driver:'assisted',planVersion:'test',contractJson:'{}',createdAt:new Date(Date.now()+1000)}});
  await assert.rejects(service.applyFinalChapter({...assisted,appearances:extracted.characterAppearances}),/后续批次/);
  console.log('appearance checks passed');
}finally{await prisma.$disconnect();}})().catch(error=>{console.error(error);process.exitCode=1;});
`);
  try {
    const result = execFileSync(process.execPath,[script],{cwd:server,encoding:'utf8',timeout:90000,
      env:{...process.env,DATABASE_PROVIDER:'sqlite',DATABASE_URL:databaseUrl,TEST_SERVER_ROOT:server,DIRECTOR_NEXT_ENABLED:'true'}});
    if(!result.includes('appearance checks passed')) throw Error(result);
  } finally {
    const resolved=path.resolve(dir);
    if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('v2-appearances-')) throw Error('Unsafe cleanup');
    fs.rmSync(resolved,{recursive:true,force:true});
  }
});
