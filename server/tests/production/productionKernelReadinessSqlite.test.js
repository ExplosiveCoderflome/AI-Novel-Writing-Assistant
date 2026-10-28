const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./batch/fixture.cjs');
const ready=()=>require('../../dist/app/director/productionKernel/readiness');
test('storage readiness checks the migrated columns, uniqueness and foreign keys without changing data',async t=>{
 const f=await fixture(t),before=await f.db.chapter.findMany();
 assert.deepEqual(await ready().inspectProductionStorage(f.db,'sqlite'),{ready:true});
 assert.deepEqual(await f.db.chapter.findMany(),before);
});
test('missing table, column, unique index or foreign key fails readiness in a disposable database',async t=>{
 for(const kind of ['table','column','unique','partial','foreign'])await t.test(kind,async t=>{
  const f=await fixture(t);
  if(kind==='table')await f.db.$executeRawUnsafe('DROP TABLE "ProductionUnitRun"');
  if(kind==='column')await f.db.$executeRawUnsafe('ALTER TABLE "ProductionUnitRun" DROP COLUMN "activeRequestKey"');
  if(kind==='unique')await f.db.$executeRawUnsafe('DROP INDEX "ProductionUnitRun_ownerKey_chapterId_key"');
  if(kind==='partial'){
   await f.db.$executeRawUnsafe('DROP INDEX "ProductionUnitRun_ownerKey_chapterId_key"');
   await f.db.$executeRawUnsafe('CREATE UNIQUE INDEX "PartialUnitOwner" ON "ProductionUnitRun"("ownerKey","chapterId") WHERE "ownerKey" = \'other\'');
  }
  if(kind==='foreign'){
   await f.db.$executeRawUnsafe('ALTER TABLE "ProductionUnitRun" RENAME TO "OldUnitRun"');
   await f.db.$executeRawUnsafe('CREATE TABLE "ProductionUnitRun" AS SELECT * FROM "OldUnitRun"');
  }
  const value=await ready().inspectProductionStorage(f.db,'sqlite');
  assert.equal(value.ready,false);assert.equal(value.issues[0].code,'production_storage_not_ready');
 });
});
test('connection failures never report ready or expose raw database errors',async()=>{
 const result=await ready().inspectProductionStorage({$queryRawUnsafe:async()=>{throw Error('private.db secret');}},'sqlite');
 assert.equal(result.ready,false);assert.ok(!JSON.stringify(result).includes('private.db'));
});
test('missing exact model windows or executable output caps blocks readiness without a model request',async t=>{
 const f=await fixture(t);let caps=4000;
 const sources={readWindows:()=>[],readFallback:async()=>({enabled:false,provider:'test',model:'test',temperature:.2,maxTokens:4000,retryCount:0}),
  resolveModel:async(provider,options)=>({provider,model:options.model,maxTokens:caps,baseURL:'https://invalid.test',temperature:.2,taskType:options.taskType})};
 let result=await ready().inspectKernelStartReadiness(f.db,f.contract,sources);
 assert.equal(result.ready,false);assert.equal(result.issues[0].code,'production_model_capability_missing');
 sources.readWindows=()=>[{provider:'test',model:'test',contextWindow:100000}];
 assert.equal((await ready().inspectKernelStartReadiness(f.db,f.contract,sources)).ready,true);
 for(const cap of [undefined,0,100000]){caps=cap;assert.equal((await ready().inspectKernelStartReadiness(f.db,f.contract,sources)).ready,false);}
});
test('open readiness selects only authorized new kernel batches; bound kernel resume ignores the default flag',async t=>{
 const f=await fixture(t),api=ready();let checked=0;
 const inspect=async()=>{checked++;return {ready:false,issues:[{code:'production_model_capability_missing',message:'缺少上下文配置'}]};};
 await api.assertKernelOpenReadiness(f.db,f.contract,{enabled:()=>false,inspect});assert.equal(checked,0);
 await api.assertKernelOpenReadiness(f.db,{...f.contract,chapterRange:null},{enabled:()=>true,inspect});assert.equal(checked,0);
 await assert.rejects(()=>api.assertKernelOpenReadiness(f.db,f.contract,{enabled:()=>true,inspect}),e=>e.code==='production_model_capability_missing');
 assert.equal(checked,1);
 await f.api.chooseProductionBatchImplementation(f.db,f.context,true);
 await assert.rejects(()=>api.assertKernelOpenReadiness(f.db,f.contract,{enabled:()=>false,inspect}),e=>e.code==='production_model_capability_missing');
 assert.equal(checked,2);
});
