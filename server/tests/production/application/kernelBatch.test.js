const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../../../dist/app/director/productionKernel');
const {hashProductionContent:hash}=require('../../../dist/modules/production');
function setup(options={}) {
 assert.equal(typeof api.createKernelChapterBatchHandler,'function','kernel batch handler must be exported');
 const context={runId:'r',contract:{novelId:'n',scope:'chapters:1-3',chapterRange:{from:1,to:3}}};
 const chapters=[1,2,3].map(order=>({id:'c'+order,novelId:'n',order,content:'body '+order}));
 const saved=new Map(),ran=[];
 const outcome=(chapter,status='completed')=>({status,progress:{unit:{novelId:'n',chapterId:chapter.id,order:chapter.order},
  completed:['prepare','draft','accept','commit','reconcile'],repairAttemptsUsed:0,selected:'original',
  selectedContentHash:hash(chapter.content),committedContentHash:hash(chapter.content),reconcileStatus:'completed',
  debts:chapter.order===2?[{code:'local_gap',severity:'medium',source:'accept'}]:[]}});
 const handler=api.createKernelChapterBatchHandler({assertActive:async()=>{},readChapters:async()=>structuredClone(chapters),
  readOutcome:async(_ctx,chapter)=>saved.get(chapter.id),hashBatch:()=> 'saved-batch-hash',runChapter:async(_ctx,chapter)=>{
   ran.push(chapter.order);const result=outcome(chapter,options.unknownAt===chapter.order?'unknown':'completed');
   if(options.editAt===chapter.order)chapters[chapter.order-1].content='human edit';
   if(result.status==='completed')saved.set(chapter.id,result);return result;
  }});
 return {context,chapters,saved,ran,handler,outcome};
}
test('a complete range closes once while chapter-local debt permits later chapters',async()=>{
 const f=setup(),result=await f.handler(f.context);
 assert.deepEqual(f.ran,[1,2,3]);assert.equal(result.artifact.contentHash,'saved-batch-hash');
 assert.deepEqual(result.debts,[{chapterOrder:2,code:'local_gap',action:'defer_and_continue'}]);
 assert.equal(result.stopSignal,undefined);
 await f.handler(f.context);assert.deepEqual(f.ran,[1,2,3]);
});
test('editing chapter three invalidates closure and preserves the earlier completed chapters',async()=>{
 const f=setup({editAt:3}),result=await f.handler(f.context);
 assert.equal(result.artifact,undefined);assert.equal(result.stopSignal.kind,'data_integrity');
 assert.equal(f.chapters[2].content,'human edit');assert.ok(f.saved.has('c1'));assert.ok(f.saved.has('c2'));
});
test('an unknown chapter request pauses without starting the following chapter',async()=>{
 const f=setup({unknownAt:2}),result=await f.handler(f.context);
 assert.deepEqual(f.ran,[1,2]);assert.equal(result.artifact,undefined);
 assert.equal(result.stopSignal.kind,'manual_recovery');assert.equal(result.stopSignal.source,'runtime');
});
test('foreign and missing chapters fail before any generation',async()=>{
 for(const invalid of ['foreign','missing']) {
  const f=setup();if(invalid==='foreign')f.chapters[1].novelId='other';else f.chapters.pop();
  const result=await f.handler(f.context);assert.equal(result.stopSignal.kind,'data_integrity');assert.deepEqual(f.ran,[]);
 }
});
test('a corrupt saved completion stops without attempting to regenerate that chapter',async()=>{
 const f=setup();f.saved.set('c1',{...f.outcome(f.chapters[0],'failed'),reason:'data_integrity'});
 const result=await f.handler(f.context);
 assert.equal(result.stopSignal.kind,'data_integrity');assert.equal(result.artifact,undefined);assert.deepEqual(f.ran,[]);
});
test('the batch router invokes exactly the persisted implementation and rejects unknown bindings',async()=>{
 assert.equal(typeof api.createProductionBatchRouter,'function','saved batch router must be exported');
 const ran=[];let selected='kernel';
 const handler=api.createProductionBatchRouter({enabled:()=>false,choose:async()=>selected,
  legacy:async()=>{ran.push('legacy');return{}},kernel:async()=>{ran.push('kernel');return{}}});
 await handler({});selected='legacy';await handler({});assert.deepEqual(ran,['kernel','legacy']);
 selected='broken';await assert.rejects(()=>handler({}),/implementation/);assert.deepEqual(ran,['kernel','legacy']);
});
