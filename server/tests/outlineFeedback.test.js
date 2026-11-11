const test = require('node:test');
const assert = require('node:assert/strict');
const {mkdtempSync,readFileSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const Sqlite = require('better-sqlite3');
const {PrismaClient} = require('@prisma/client');
const {PrismaBetterSqlite3} = require('@prisma/adapter-better-sqlite3');
const {fullSchemaSql} = require('./production/persistence/sqliteFixture.cjs');
const {createEmptyOutlineDocument} = require('@ai-novel/shared/types/outline');
const {mapOutlineBook} = require('../dist/modules/planning/outline/openBook/domain/mapping');
const {buildOutlineWorkspace} = require('../dist/modules/planning/outline/openBook/domain/assets');
const {OutlineFeedbackService} = require('../dist/modules/planning/outline/feedback/application/OutlineFeedbackService');
const {feedbackDue} = require('../dist/modules/planning/outline/feedback/domain/feedbackPolicy');

async function fixture(t, analyzer) {
  const path = join(mkdtempSync(join(tmpdir(), 'a3-feedback-')), 'test.sqlite');
  const sqlite = new Sqlite(path); sqlite.exec(fullSchemaSql()); sqlite.close();
  const db = new PrismaClient({adapter: new PrismaBetterSqlite3({url: `file:${path}`})});
  t.after(() => db.$disconnect());
  await db.novel.create({data: {id: 'n', title: '书'}});
  for (let order=1;order<=3;order++) await db.chapter.create({data: {id:`c${order}`, novelId:'n', order, title:`第${order}章`, content:order===1?'DO_NOT_SEND_FULL_TEXT':'', generationState:order===1?'drafted':'planned'}});
  await db.chapterSummary.create({data:{novelId:'n',chapterId:'c1',summary:'主角发现钥匙是假的'}});
  const d = createEmptyOutlineDocument('书');
  d.story.premise='主角调查假钥匙交易';
  d.volumes=[{nodeId:'v',order:0,title:'卷',summary:'卷纲',planningDepth:'rough',chapterNodeIds:['s1','s2','s3']}];
  d.chapters=[1,2,3].map((x)=>({nodeId:`s${x}`,volumeNodeId:'v',order:x-1,title:`第${x}章`,summary:`原章纲${x}`,purpose:'调查',planningDepth:'rough',characterNodeIds:[],payoffNodeIds:[]}));
  d.characters=[{nodeId:'hero',name:'主角',arcDirection:'追求真相',appearanceNodeIds:['s1','s2','s3']}];
  d.payoffs=[{nodeId:'key',title:'假钥匙',kind:'foreshadowing',setupDescription:'钥匙来历可疑',payoffDescription:'查明幕后交易',setupChapterNodeIds:['s1'],payoffChapterNodeIds:['s3'],relatedNodeIds:[]}];
  const m=mapOutlineBook(d,{revisionId:'r',expectedProjectVersion:1,bookSettings:{title:'书',estimatedChapterCount:3},volumeQuotas:{v:3},allowOptimize:[{nodeId:'s2',field:'summary'},{nodeId:'s3',field:'purpose'},{nodeId:'hero',field:'arcDirection'},{nodeId:'key',field:'payoffDescription'}]},'b');
  m.mapping.chapters.forEach((c,i)=>c.chapterId=`c${i+1}`);
  const w=buildOutlineWorkspace('n',d,m.mapping,3000,'wv');
  await db.outlineProject.create({data:{id:'p',title:'书',currentVersion:1,currentRevisionId:'r'}});
  await db.outlineRevision.create({data:{id:'r',projectId:'p',version:1,sourceType:'manual',documentJson:JSON.stringify(d)}});
  await db.outlineBookBinding.create({data:{id:'b',projectId:'p',revisionId:'r',revisionVersion:1,sourceDocumentHash:m.sourceDocumentHash,novelId:'n',requestKey:'book',requestHash:m.requestHash,mappingJson:JSON.stringify(m.mapping),policyJson:JSON.stringify(m.policy),postCreateStateJson:'{}'}});
  await db.volumePlanVersion.create({data:{id:'wv',novelId:'n',version:1,status:'active',contentJson:JSON.stringify(w)}});
  await db.$transaction(tx=>require('../dist/services/novel/volume/volumeWorkspacePersistence').persistActiveVolumeWorkspace(tx,'n',w,'wv'));
  let calls=0;const queue=[];
  const service=new OutlineFeedbackService(db,async(input)=>{calls++;assert.doesNotMatch(JSON.stringify(input),/DO_NOT_SEND_FULL_TEXT/);assert.equal(input.summary,'主角发现钥匙是假的');return analyzer?analyzer(input):{operations:[{operationId:'a',kind:'update_fields',nodeId:'s2',fields:{summary:'追查假钥匙的来历'},reason:'承接本章发现',dependsOn:[]},{operationId:'b',kind:'update_fields',nodeId:'s3',fields:{purpose:'揭示幕后买家'},reason:'推进后续任务',dependsOn:[]}]};},work=>queue.push(work));
  return {db,service,queue,m,d,calls:()=>calls,drain:async()=>{while(queue.length)await queue.shift()();}};
}
test('trigger modes cover default chapter, N, volume and off',()=>{
 const mapping={volumes:[{to:4}],runtimeVolumes:[{to:8}]};
 for(const [mode,everyN,order,want] of [['chapter',5,1,true],['every_n',3,2,false],['every_n',3,3,true],['volume',5,4,true],['volume',5,8,true],['volume',5,3,false],['off',5,4,false]])assert.equal(feedbackDue({mode,everyN},order,mapping),want);
});
test('SQLite additive migration preserves binding rows and persists feedback runs',()=>{
 const db=new Sqlite(':memory:');
 db.exec('CREATE TABLE "OutlineBookBinding" ("id" TEXT PRIMARY KEY); INSERT INTO "OutlineBookBinding" VALUES (\'keep\');');
 db.exec(readFileSync(join(__dirname,'../src/prisma/migrations.sqlite/20261111150000_outline_feedback/migration.sql'),'utf8'));
 assert.deepEqual(db.prepare('SELECT * FROM "OutlineBookBinding"').get(),{id:'keep',feedbackSettingsJson:'{}'});
 db.prepare('INSERT INTO "OutlineFeedbackRun" (id,projectId,novelId,chapterId,chapterOrder,requestKey,inputJson,updatedAt) VALUES (?,?,?,?,?,?,?,?)').run('r','p','n','c',1,'key','{}',new Date().toISOString());
 assert.equal(db.prepare('SELECT status FROM "OutlineFeedbackRun"').get().status,'pending');db.close();
});
test('pending is nonblocking, summary-only and deduplicated; partial adoption creates versions and leaves source/current intact',async t=>{
 const f=await fixture(t),run=await f.service.enqueue('p','c1','manual');
 assert.equal(run.status,'pending');assert.equal(f.calls(),0);
 assert.equal((await f.service.enqueue('p','c1','manual')).id,run.id);
 await f.drain();assert.equal(f.calls(),1);
 assert.equal((await f.service.status('p')).runs[0].items.length,2);
 await f.service.decide('p',run.id,['a'],'adopted');
 assert.equal((await f.db.outlineProject.findUnique({where:{id:'p'}})).currentVersion,2);
 assert.equal((await f.db.chapter.findUnique({where:{id:'c2'}})).expectation,'追查假钥匙的来历');
 assert.equal((await f.db.chapter.findUnique({where:{id:'c1'}})).content,'DO_NOT_SEND_FULL_TEXT');
 assert.equal((await f.db.outlineRevision.findUnique({where:{id:'r'}})).documentJson,JSON.stringify(f.d));
 await f.service.decide('p',run.id,['a'],'adopted');assert.equal(await f.db.outlineRevision.count(),2);
 await f.service.decide('p',run.id,['b'],'adopted');assert.equal(await f.db.outlineRevision.count(),3);
 assert.equal((await f.service.status('p')).runs[0].items.every(i=>i.status==='adopted'),true);
});
test('rejection is per-item and idempotent without outline mutation; generic A1 cannot bypass feedback adoption',async t=>{
 const f=await fixture(t),run=await f.service.enqueue('p','c1','reject');await f.drain();
 const items=(await f.service.status('p')).runs[0].items;
 const {OutlineProposalService}=require('../dist/modules/planning/outline/application/OutlineProposalService');
 const {OutlineRepository}=require('../dist/modules/planning/outline/infrastructure/OutlineRepository');
 await assert.rejects(()=>new OutlineProposalService(new OutlineRepository(f.db)).apply('p',items[0].proposalId,['a']),/逐项/);
 await f.service.decide('p',run.id,['a'],'rejected');await f.service.decide('p',run.id,['a'],'rejected');
 assert.equal((await f.service.status('p')).runs[0].items[1].status,'pending');assert.equal(await f.db.outlineRevision.count(),1);
 await assert.rejects(()=>f.service.decide('p',run.id,['a'],'adopted'));
});
test('unbound automatic pipeline and B1 never invoke analyzer or create runs',async t=>{
 const f=await fixture(t);f.service.notify('unbound','no-chapter');await f.drain();
 await f.db.manuscriptProject.create({data:{id:'manuscript',novelId:'n',status:'ready',baselineOutlineRevisionId:'r',workingOutlineProjectId:'p'}});
 f.service.notify('n','c1');await f.drain();assert.equal(f.calls(),0);assert.equal(await f.db.outlineFeedbackRun.count(),0);
 await assert.rejects(()=>f.service.enqueue('p','c1','blocked'),/仅大纲/);
});
test('automatic off suppresses analysis, default chapter queues it, failure is visible and retryable',async t=>{
 let fail=true;const f=await fixture(t,()=>{if(fail)throw Error('model failure');return {operations:[]};});
 await f.service.settings('p',{mode:'off'});f.service.notify('n','c1');await f.drain();assert.equal(f.calls(),0);
 await f.service.settings('p',{mode:'chapter'});f.service.notify('n','c1');await f.drain();
 let run=(await f.service.status('p')).runs[0];assert.equal(run.status,'failed');assert.ok(run.error);
 fail=false;await f.service.retry('p',run.id);await f.drain();run=(await f.service.status('p')).runs[0];assert.equal(run.status,'completed');assert.equal(run.attempt,2);
});
test('stale policy, locked model output, progressed chapters and changed workspace cannot be adopted',async t=>{
 for(const change of ['policy','progress','workspace','version','summary'])await t.test(change,async t=>{
  const f=await fixture(t),run=await f.service.enqueue('p','c1',change);await f.drain();
  if(change==='policy')await f.db.outlineBookBinding.update({where:{id:'b'},data:{policyVersion:2}});
  if(change==='progress')await f.db.chapter.update({where:{id:'c2'},data:{content:'后续已写正文',generationState:'drafted'}});
  if(change==='workspace')await f.db.volumePlanVersion.update({where:{id:'wv'},data:{contentJson:JSON.stringify({...JSON.parse((await f.db.volumePlanVersion.findUnique({where:{id:'wv'}})).contentJson),edited:true})}});
  if(change==='version')await f.db.outlineProject.update({where:{id:'p'},data:{currentVersion:2}});
  if(change==='summary')await f.db.chapterSummary.update({where:{chapterId:'c1'},data:{summary:'作者修正实际结果'}});
  await assert.rejects(()=>f.service.decide('p',run.id,['a'],'adopted'));assert.equal(await f.db.outlineRevision.count(),1);
 });
 const f=await fixture(t,()=>({operations:[{operationId:'x',kind:'update_fields',nodeId:'s1',fields:{summary:'非法改写'},reason:'越界',dependsOn:[]}]}));
 const run=await f.service.enqueue('p','c1','bad');await f.drain();assert.equal((await f.service.status('p')).runs[0].status,'failed');assert.equal(await f.db.outlineProposal.count(),0);
});
test('character arcs and payoff changes invalidate mapped future tasks while keeping current plans intact',async t=>{
 const f=await fixture(t,()=>({operations:[{operationId:'arc',kind:'update_fields',nodeId:'hero',fields:{arcDirection:'学会信任伙伴'},reason:'应对欺骗',dependsOn:[]},{operationId:'payoff',kind:'update_fields',nodeId:'key',fields:{payoffDescription:'以假钥匙引出幕后买家'},reason:'承接发现',dependsOn:[]}]}));
 const row=await f.db.volumePlanVersion.findUnique({where:{id:'wv'}}),workspace=JSON.parse(row.contentJson);
 workspace.volumes[0].chapters.forEach(c=>c.taskSheet='旧执行任务');
 await f.db.volumePlanVersion.update({where:{id:'wv'},data:{contentJson:JSON.stringify(workspace)}});
 const run=await f.service.enqueue('p','c1','arcs');await f.drain();await f.service.decide('p',run.id,['arc','payoff'],'adopted');
 const after=JSON.parse((await f.db.volumePlanVersion.findUnique({where:{id:'wv'}})).contentJson);
 assert.equal(after.volumes[0].chapters[0].taskSheet,'旧执行任务');assert.equal(after.volumes[0].chapters[1].taskSheet,null);assert.equal(after.volumes[0].chapters[2].taskSheet,null);
 const binding=await f.db.outlineBookBinding.findUnique({where:{id:'b'}}),effective=await require('../dist/modules/planning/outline/constraints').readOutlinePlanningState(f.db,'n');
 assert.equal(effective.document.characters[0].arcDirection,'学会信任伙伴');assert.equal(effective.document.payoffs[0].payoffDescription,'以假钥匙引出幕后买家');assert.equal(binding.revisionId,'r');
});
test('registered feedback prompt is bounded and required generation context can be excluded',async()=>{
 const {getRegisteredPromptAsset}=require('../dist/prompting/registry');
 const asset=getRegisteredPromptAsset('outline.text_feedback','v1');assert.ok(asset.outputSchema);assert.equal(asset.management.productPrompt,true);
 const {withRequiredPromptContext,withoutRequiredPromptContext,appendRequiredPromptContext}=require('../dist/prompting/core/requiredContext');
 await withRequiredPromptContext({key:'outline:test',value:{previousActualResult:{content:'DO_NOT_SEND_FULL_TEXT'}}},async()=>{
   assert.equal(appendRequiredPromptContext([]).length,1);
   assert.equal(withoutRequiredPromptContext(()=>appendRequiredPromptContext([])).length,0);
 });
});
