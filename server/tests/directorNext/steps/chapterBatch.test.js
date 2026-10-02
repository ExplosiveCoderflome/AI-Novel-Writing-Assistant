const test=require('node:test');const assert=require('node:assert/strict');
const {createChapterBatchStepHandler}=require('../../../dist/modules/director/steps/production/chapterBatch');
const context={runId:'run',contract:{novelId:'novel',scope:'book',chapterRange:{from:1,to:2},issuePolicy:{mode:'completion_first'}}};
const base={id:'job',novelId:'novel',startOrder:1,endOrder:2,status:'succeeded',pendingManualRecovery:false};
const chapters=[{id:'c1',novelId:'novel',order:1,content:'正文一',closed:true},{id:'c2',novelId:'novel',order:2,content:'正文二',closed:true}];
function setup({jobs=[base],bound=null,outcome={chapters,debts:[]},input={startOrder:1,endOrder:2,model:'saved-model'}}={}) {
 const calls=[];let index=0;
 const handler=createChapterBatchStepHandler({inputProvider:async()=>input,
  jobBinding:{get:async()=>bound,save:async(run,id)=>calls.push(['bind',run,id])},
  pipelineService:{startPipelineJob:async(novel,options)=>{calls.push(['start',novel,options]);return jobs[0];},
   getPipelineJobById:async id=>{calls.push(['read',id]);return jobs[Math.min(index++,jobs.length-1)];},
   resumePipelineJob:async id=>calls.push(['resume',id])},
  readOutcome:async()=>outcome,waitForPoll:async()=>calls.push(['wait']),isRunActive:async()=>true,contentHash:()=> 'saved-hash'});
 return {handler,calls};
}
test('batch starts only authorized range with preserved snapshot and registers saved closure',async()=>{
 const {handler,calls}=setup();const result=await handler(context);
 assert.equal(calls[0][0],'start');assert.equal(calls[0][2].model,'saved-model');assert.equal(calls[0][2].skipCompleted,true);
 assert.deepEqual(calls[1],['bind','run','job']);assert.equal(result.artifact.contentRef,'chapter_batch_closed:novel:1-2');
});
test('local quality debt with usable closed prose does not stop the director',async()=>{
 const debt={chapterOrder:1,code:'local_patch_plan',action:'defer_and_continue'};
 const {handler}=setup({outcome:{chapters,debts:[debt]}});const result=await handler(context);
 assert.deepEqual(result.debts,[debt]);assert.equal(result.stopSignal,undefined);
});
test('explicit replan, safety, integrity and quality-first manual decisions are preserved',async()=>{
 for(const kind of ['replan','safety','data_integrity','manual_recovery']) {
  const stopSignal={kind,reason:'结构化决定'};const {handler}=setup({outcome:{chapters,debts:[],stopSignal}});
  const result=await handler({...context,contract:{...context.contract,issuePolicy:{mode:'quality_first'}}});assert.deepEqual(result.stopSignal,stopSignal);
 }
});
test('a terminal batch with missing usable closed prose cannot create a completion artifact',async()=>{
 for(const saved of [chapters.slice(0,1),chapters.map(c=>({...c,content:''})),chapters.map(c=>({...c,closed:false}))]) {
  const {handler}=setup({outcome:{chapters:saved,debts:[]}});const result=await handler(context);
  assert.equal(result.stopSignal.kind,'no_usable_content');assert.equal(result.artifact,undefined);
 }
});
test('restored binding resumes an active job and polls instead of creating another',async()=>{
 const {handler,calls}=setup({bound:'job',jobs:[{...base,status:'running'},base]});await handler(context);
 assert.equal(calls.some(c=>c[0]==='start'),false);assert.equal(calls.some(c=>c[0]==='resume'),true);assert.equal(calls.some(c=>c[0]==='wait'),true);
});
test('cross-book or wrong-range jobs stop before resume',async()=>{
 for(const job of [{...base,novelId:'other'},{...base,endOrder:3}]) {
  const {handler,calls}=setup({bound:'job',jobs:[job]});const result=await handler(context);
  assert.equal(result.stopSignal.kind,'data_integrity');assert.equal(calls.some(c=>c[0]==='resume'),false);
 }
});
test('invalid or out-of-contract input fails before starting a job',async()=>{
 const {handler,calls}=setup({input:{startOrder:1,endOrder:3}});await assert.rejects(()=>handler(context));assert.equal(calls.length,0);
});
test('manual-pending jobs are never automatically resumed',async()=>{
 const {handler,calls}=setup({bound:'job',jobs:[{...base,status:'running',pendingManualRecovery:true}],outcome:{chapters,debts:[],stopSignal:{kind:'manual_recovery',reason:'需确认'}}});
 await handler({...context,contract:{...context.contract,issuePolicy:{mode:'quality_first'}}});assert.equal(calls.some(c=>c[0]==='resume'),false);
});
