const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('./persistence/sqliteFixture.cjs');
const {request}=require('./application/harness.cjs');
const kernel=require('../../dist/modules/production');
const quality=require('@ai-novel/shared/types/chapterQualityLoop');
const score={coherence:90,repetition:90,pacing:90,voice:90,engagement:90,overall:90};
function assessment(summary,unavailable=false) {
 return {assessment:{status:unavailable?'continue_with_risk':'accepted',score,summary,
  blockingIssues:unavailable?[{category:'mode_fit',severity:'medium',code:'acceptance_gate_unavailable',evidence:'检查尚未完成',fixSuggestion:'重新审校'}]:[],
  missingObligations:[],repairDirectives:[],repairability:'none',decisionReason:summary,
  riskTags:unavailable?['acceptance_gate_unavailable']:[],assetSyncRecommendation:{priority:'normal',reason:'已保存',requiresFullPayoffReconcile:false},continuePolicy:'continue'},score,issues:[],auditReports:[]};
}
async function fixture(t,options={}) {
 assert.equal(typeof kernel.ProductionChapterLifecycleService.prototype.finalizeSelected,'function','selected assessment finalizer must exist');
 const f=await setup(t),life=new kernel.ProductionChapterLifecycleService(),candidate='主角保管钥匙。';
 const content=options.candidate?candidate:f.context.content,contentHash=kernel.hashProductionContent(content);
 await f.db.chapter.update({where:{id:'chapter-1'},data:{content,generationState:'drafted',chapterStatus:'pending_review'}});
 const store=new kernel.PrismaUnitProgressStore(f.db,{assertOwnership:f.assertOwnership,writeChapter:life.commit.bind(life),
  finalizeChapter:async(tx,run,next)=>{await life.finalizeSelected(tx,run,next);if(options.failAfter)throw Error('publication failed');}});
 const previous=await store.loadOrCreate(request());
 const stages=options.candidate?['prepare','draft','accept','repair','verify','select','commit']:['prepare','draft','accept','commit'];
 const run=await store.compareAndSwap(previous,{...previous,progress:{...previous.progress,completed:stages,
  original:{contentHash:kernel.hashProductionContent(f.context.content)},...(options.candidate?{candidate:{contentHash}}:{}),
  selected:options.candidate?'candidate':'original',selectedContentHash:contentHash,committedContentHash:contentHash,
  ...(options.unavailable?{debts:[{code:'review_unavailable',severity:'medium',source:'accept'}]}:{})},
  artifacts:{...previous.artifacts,original:f.context.content,...(options.candidate?{candidate}:{}),
   stageData:{accept:assessment('原稿审校',options.unavailable),verify:assessment('候选审校')}},activeStage:'reconcile',activeRequestKey:'reconcile-request'});
 const close=(status='completed')=>store.compareAndSwap(run,{...run,progress:{...run.progress,completed:[...stages,'reconcile'],reconcileStatus:status},activeStage:null,activeRequestKey:null});
 return {...f,store,run,close};
}
for(const candidate of [false,true])test(`final publication writes only the selected ${candidate?'candidate':'original'} assessment and chapter closure`,async t=>{
 const f=await fixture(t,{candidate});await f.close();
 const reports=await f.db.auditReport.findMany({include:{issues:true}}),chapter=await f.db.chapter.findUnique({where:{id:'chapter-1'}});
 assert.equal(reports.length,1);assert.equal(reports[0].summary,candidate?'候选审校':'原稿审校');
 assert.equal(reports[0].overallScore,90);assert.equal(chapter.generationState,'approved');assert.equal(chapter.chapterStatus,'completed');
 const ids=reports.map(row=>row.id);assert.equal(await f.close(),null);
 assert.deepEqual((await f.db.auditReport.findMany()).map(row=>row.id),ids);
});
test('unavailable checks publish a review debt without a fabricated score and preserve unrelated conflicts',async t=>{
 const f=await fixture(t,{unavailable:true});
 await f.db.openConflict.create({data:{novelId:'novel-1',chapterId:'chapter-1',sourceType:'state_diff',conflictType:'state',conflictKey:'state',title:'state',summary:'keep'}});
 await f.close();const report=await f.db.auditReport.findFirst({include:{issues:true}});
 assert.equal(report.overallScore,null);assert.equal(JSON.parse(report.legacyScoreJson).scoreAvailable,false);
 assert.equal(JSON.parse(report.legacyScoreJson).overall,undefined);assert.equal(report.issues[0].code,'acceptance_gate_unavailable');
 const conflict=await f.db.openConflict.findFirst({where:{sourceType:'audit_issue'}});
 assert.equal(conflict.sourceIssueId,report.issues[0].id);assert.equal(conflict.status,'open');
 assert.equal((await f.db.openConflict.findFirst({where:{sourceType:'state_diff'}})).status,'open');
 const chapter=await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}});
 const debt=quality.readChapterQualityDebtDetails(chapter.riskFlags);
 assert.ok(debt,'the shared chapter UI must read the saved production debt');
 assert.equal(debt.source,'pipeline_review');assert.equal(debt.repairAttemptsUsed,0);assert.equal(debt.repairAttemptsAllowed,1);
 assert.ok(debt.issueCodes.includes('acceptance_gate_unavailable'));
 assert.equal(quality.classifyChapterQualityLoopRiskFlags(chapter.riskFlags),'non_blocking_quality_debt');
});
test('the retained successful assessment closes stale debt without removing unrelated chapter flags',async t=>{
 const f=await fixture(t);
 await f.db.chapter.update({where:{id:'chapter-1'},data:{riskFlags:JSON.stringify({authorNote:'keep',qualityLoop:{
  rootCauseCode:'replan_required',recommendedAction:'replan',overallStatus:'invalid'}})}});
 await f.close();const chapter=await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}});
 assert.equal(JSON.parse(chapter.riskFlags).authorNote,'keep');
 assert.equal(quality.classifyChapterQualityLoopRiskFlags(chapter.riskFlags),'none');
 assert.equal(quality.readChapterQualityDebtDetails(chapter.riskFlags),null);
});
test('pending assets do not publish review reports or completed chapter state',async t=>{
 const f=await fixture(t);await f.close('pending');assert.equal(await f.db.auditReport.count(),0);
 assert.equal((await f.db.chapter.findUnique({where:{id:'chapter-1'}})).generationState,'drafted');
});
test('an edited manuscript or revoked lease cannot publish reports or the reconcile receipt',async t=>{
 for(const changed of ['content','lease']) {
  const f=await fixture(t);if(changed==='content')await f.db.chapter.update({where:{id:'chapter-1'},data:{content:'人工正文'}});else await f.revoke();
  await assert.rejects(()=>f.close(),/version|ownership|manuscript/i);
  assert.equal(await f.db.auditReport.count(),0);
  assert.equal((await f.db.productionUnitRun.findUnique({where:{id:f.run.id}})).version,f.run.version);
 }
});
test('a failure after report creation rolls back chapter state, conflicts, reports and progress together',async t=>{
 const f=await fixture(t,{unavailable:true,failAfter:true});await assert.rejects(()=>f.close(),/publication failed/);
 assert.equal(await f.db.auditReport.count(),0);assert.equal(await f.db.openConflict.count(),0);
 assert.equal((await f.db.chapter.findUnique({where:{id:'chapter-1'}})).generationState,'drafted');
 assert.equal((await f.db.productionUnitRun.findUnique({where:{id:f.run.id}})).version,f.run.version);
});
