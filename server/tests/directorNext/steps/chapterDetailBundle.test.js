const test=require('node:test');
const assert=require('node:assert/strict');
const {createChapterDetailBundleStepHandler}=require('../../../dist/modules/director/steps/planning/chapterDetailBundle');
const context={runId:'run',contract:{novelId:'novel',scope:'chapter:1-2',chapterRange:{from:1,to:2},issuePolicy:{mode:'completion_first'}}};
const workspace={novelId:'novel',volumes:[{id:'v',chapters:[{id:'p1',chapterOrder:1},{id:'p2',chapterOrder:2},{id:'p3',chapterOrder:3}]}]};
const input={workspace,targets:[{volumeId:'v',chapterId:'p1'},{volumeId:'v',chapterId:'p2'}],provider:'openai',model:'saved',temperature:0.3,guidance:'本次要求'};
function setup({seed=input,quality=false,decision={action:'continue_with_warning',reason:'局部问题'},saveFailure=false,dropSaved=false,generationFailure=false,invalidQuality=false}={}) {
  const calls=[];
  const handler=createChapterDetailBundleStepHandler({inputProvider:async()=>seed,volumeService:{
    generateVolumes:async(novelId,options)=>{
      calls.push(['generate',novelId,options]);
      if(generationFailure) throw new Error('生成失败');
      if(invalidQuality) await options.onChapterTaskSheetQuality({chapterId:options.targetChapterId,chapterOrder:1,result:{status:'blocked',canEnterExecution:false,issues:[]}});
      if(quality) await options.onChapterTaskSheetQuality({chapterId:options.targetChapterId,chapterOrder:options.targetChapterId==='p1'?1:2,result:{status:'repairable',canEnterExecution:true,issues:[{id:'local',summary:'补充目标'}]},assessment:{recommendedHandling:'repair_contract'}});
      return {...options.draftWorkspace,volumes:options.draftWorkspace.volumes.map(v=>({...v,chapters:v.chapters.map(c=>c.id===options.targetChapterId?{...c,purpose:'推进情节',taskSheet:'任务单',sceneCards:'场景计划'}:c)}))};
    },
    updateVolumesWithOptions:async(novelId,document,options)=>{calls.push(['save',novelId,document,options]);if(saveFailure)throw new Error('保存失败');return dropSaved?workspace:document;},
  },resolveIssues:async(ctx,reports)=>{calls.push(['decision',ctx,reports]);return decision;},contentHash:value=>{calls.push(['hash',value]);return 'saved-hash';}});
  return {handler,calls};
}
test('detail bundle targets only authorized chapters, chains drafts and records saved complete task sheets',async()=>{
  const {handler,calls}=setup();
  const result=await handler(context);
  const generate=calls.filter(row=>row[0]==='generate');
  assert.deepEqual(generate.map(row=>row[2].targetChapterId),['p1','p2']);
  for (const [,novel,options] of generate) {
    assert.equal(novel,'novel');assert.equal(options.scope,'chapter_detail');assert.equal(options.detailMode,'task_sheet');
    assert.equal(options.chapterTaskSheetQualityMode,'full_book_autopilot');assert.equal(options.model,'saved');assert.equal(options.taskId,'run');
    assert.equal(options.persistIntermediateDocuments,false);
  }
  assert.equal(generate[1][2].draftWorkspace.volumes[0].chapters[0].taskSheet,'任务单');
  const save=calls.find(row=>row[0]==='save');
  assert.equal(save[3].syncToChapterExecution,false);assert.equal(save[3].emitEvent,false);
  assert.equal(save[2].volumes[0].chapters[2].taskSheet,undefined);
  assert.equal(calls.find(row=>row[0]==='hash')[1].length,2);
  assert.equal(result.artifact.contentRef,'chapter_task_sheet:novel:chapter:1-2');
});
test('local warnings produce multiple debts and no stop in completion-first mode',async()=>{
  const {handler,calls}=setup({quality:true});const result=await handler(context);
  assert.equal(result.debts.length,2);assert.equal(result.stopSignal,undefined);
  assert.equal(calls.find(row=>row[0]==='decision')[2].length,2);
});
test('only explicit issue decisions can request replan or policy-driven manual pause',async()=>{
  const replan=await setup({quality:true,decision:{action:'stop_for_replan',reason:'AI要求重排'}}).handler(context);
  assert.equal(replan.stopSignal.kind,'replan');
  const options={quality:true,decision:{action:'pause_for_manual',reason:'AI要求确认'}};
  const completion=await setup(options).handler(context);
  assert.equal(completion.stopSignal,undefined);
  assert.ok(completion.debts.every(debt=>debt.action==='continue_with_warning'));
  const paused=await setup(options).handler({...context,contract:{...context.contract,issuePolicy:{mode:'quality_first'}}});
  assert.equal(paused.stopSignal.kind,'manual_recovery');assert.ok(paused.artifact);
});
test('cross-book, missing, duplicated and out-of-range targets fail before generation',async()=>{
  for (const seed of [{...input,workspace:{...workspace,novelId:'other'}},{...input,targets:[]},{...input,targets:[{volumeId:'v',chapterId:'missing'}]},{...input,targets:[input.targets[0],input.targets[0]]},{...input,targets:[{volumeId:'v',chapterId:'p3'}]}]) {
    const {handler,calls}=setup({seed});await assert.rejects(()=>handler(context));assert.equal(calls.length,0);
  }
});
test('save failure or lost task sheets cannot be recorded as a completed artifact',async()=>{
  for(const options of [{saveFailure:true},{dropSaved:true}]) {
    const {handler,calls}=setup(options);await assert.rejects(()=>handler(context));assert.equal(calls.some(row=>row[0]==='hash'),false);
  }
});
test('generation failure and unusable contract structure never reach persistence',async()=>{
  for(const options of [{generationFailure:true},{invalidQuality:true}]) {
    const {handler,calls}=setup(options);await assert.rejects(()=>handler(context));assert.equal(calls.some(row=>row[0]==='save'),false);
  }
});
