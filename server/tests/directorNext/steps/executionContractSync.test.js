const test=require('node:test');
const assert=require('node:assert/strict');
const {createExecutionContractSyncStepHandler}=require('../../../dist/modules/director/steps/planning/executionContractSync');
const context={runId:'run',contract:{novelId:'novel',scope:'chapter:1',chapterRange:{from:1,to:3}}};
const workspace={novelId:'novel',volumes:[{id:'v',chapters:[{id:'p1',chapterOrder:1,taskSheet:'任务',sceneCards:'场景'},{id:'p2',chapterOrder:2,taskSheet:null,sceneCards:null}]}]};
const input={workspace,executionRange:{startOrder:1,endOrder:1}};
const before=[{id:'c1',novelId:'novel',order:1,content:'已有正文',taskSheet:null,sceneCards:null},{id:'outside',novelId:'novel',order:3,content:'窗口外正文',taskSheet:null,sceneCards:null}];
const after=[{...before[0],taskSheet:'任务',sceneCards:'场景'},{id:'c2',novelId:'novel',order:2,content:'',taskSheet:null,sceneCards:null},before[1]];
function setup({seed=input,saved=after,fail=false}={}) {
  const calls=[];let reads=0;
  const handler=createExecutionContractSyncStepHandler({inputProvider:async()=>seed,
    chapterService:{listChapters:async novel=>{calls.push(['read',novel]);return reads++===0?before:saved;}},
    volumeService:{syncVolumeChaptersWithOptions:async(...args)=>{calls.push(['sync',...args]);if(fail)throw new Error('同步失败');return {clearContentCount:0,deleteCount:0};}},
    contentHash:value=>{calls.push(['hash',value]);return 'persisted-contract-hash';},
  });return {handler,calls};
}
test('sync preserves prose and disables deletes, validates only the execution window and hashes persisted contracts',async()=>{
  const {handler,calls}=setup();const result=await handler(context);
  assert.deepEqual(calls[1],['sync','novel',{volumes:workspace.volumes,preserveContent:true,applyDeletes:false,allowIncompleteExecutionContracts:false,executionContractChapterRange:input.executionRange},{emitEvent:false,syncPayoffLedger:false}]);
  assert.deepEqual(calls.map(row=>row[0]),['read','sync','read','hash']);
  assert.equal(calls[3][1].length,1);assert.equal(calls[3][1][0].chapterId,'c1');
  assert.equal('content' in calls[3][1][0],false);
  assert.equal(result.artifact.contentRef,'chapter_execution_contract:novel:chapter:1:1-1');
  assert.equal(result.artifact.contentHash,'persisted-contract-hash');
});
test('invalid, cross-book, incomplete and out-of-scope input fails before synchronization',async()=>{
  for(const seed of [{...input,workspace:{...workspace,novelId:'other'}},{...input,executionRange:{startOrder:0,endOrder:1}},{...input,executionRange:{startOrder:2,endOrder:1}},{...input,executionRange:{startOrder:4,endOrder:4}},{...input,executionRange:{startOrder:1,endOrder:2}},{...input,executionRange:{startOrder:3,endOrder:3}}]) {
    const {handler,calls}=setup({seed});await assert.rejects(()=>handler(context));assert.equal(calls.length,0);
  }
});
test('sync errors do not produce an artifact',async()=>{
  const {handler,calls}=setup({fail:true});await assert.rejects(()=>handler(context),/同步失败/);
  assert.equal(calls.some(row=>row[0]==='hash'),false);
});
test('missing, cross-book or mismatched persisted contracts become integrity stops without artifacts',async()=>{
  for(const saved of [before,[{...after[0],taskSheet:'其他任务'}],[{...after[0],novelId:'other'}],[]]) {
    const {handler,calls}=setup({saved});const result=await handler(context);
    assert.equal(result.stopSignal.kind,'data_integrity');assert.equal(result.artifact,undefined);
    assert.equal(calls.some(row=>row[0]==='hash'),false);
  }
});
test('changed or removed saved prose is an integrity stop even outside the execution window',async()=>{
  for(const saved of [after.map(row=>row.id==='outside'?{...row,content:''}:row),after.filter(row=>row.id!=='outside')]) {
    const {handler}=setup({saved});const result=await handler(context);
    assert.equal(result.stopSignal.kind,'data_integrity');assert.equal(result.artifact,undefined);
  }
});
