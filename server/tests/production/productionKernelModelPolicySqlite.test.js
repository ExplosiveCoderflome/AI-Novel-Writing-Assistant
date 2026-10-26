const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./batch/fixture.cjs');
const tasks=['planner','writer','review','repair','fact_extraction','summary'];
const fallback={enabled:true,provider:'test-fallback',model:'fallback',temperature:0.2,maxTokens:4096,retryCount:1};
function source(f){
 let endpoint='https://private.example.test/api',window=100000,calls=0,maxTokens=8192,key='secret-never-persist';
 const currentFallback=structuredClone(fallback);
 const capture=()=>f.api.captureKernelModelPolicy(f.contract,{
  readWindows:()=>[{provider:'test',model:'test',contextWindow:window},{provider:'test-fallback',model:'fallback',contextWindow:200000}],
  readFallback:async()=>currentFallback,
  resolveModel:async(provider,options)=>{calls++;return {provider,model:options.model,baseURL:endpoint,apiKey:key,
   temperature:0.3,maxTokens,authMode:'bearer',modelKwargs:{custom_secret:'private-value-never-persist'},
   executionMode:'plain',requestProtocol:'openai_compatible',taskType:options.taskType};},
 });
 return {capture,change:(kind)=>{
  if(!kind||kind==='endpoint')endpoint='https://changed.example.test/api';
  if(!kind||kind==='window')window=50000;
  if(kind==='output')maxTokens=4096;
  if(kind==='fallback')currentFallback.retryCount=2;
  if(kind==='credential')key='rotated-secret';
 },calls:()=>calls};
}
test('batch model policy freezes windows, fallback and effective task configurations in one durable binding',async t=>{
 const f=await fixture(t),s=source(f);
 assert.equal(typeof f.api.bindKernelModelPolicy,'function');
 const saved=await f.api.bindKernelModelPolicy(f.db,f.context,s.capture);
 assert.equal(saved.provider,'test');assert.equal(saved.model,'test');
 assert.deepEqual([...new Set(saved.targets.map(row=>row.taskType))].sort(),tasks.sort());
 assert.equal(saved.targets.length,12);
 const event=await f.db.directorNextEvent.findFirstOrThrow({where:{type:'production_kernel_model_policy'}});
 for(const secret of ['private.example','changed.example','secret-never-persist','private-value-never-persist'])assert.ok(!event.payloadJson.includes(secret));
 const calls=s.calls();s.change();
 const resumed=await f.api.bindKernelModelPolicy(f.db,f.context,s.capture);
 assert.deepEqual(resumed,saved);assert.equal(s.calls(),calls);
 const ports=f.api.createKernelFrozenModelPolicy(saved,s.capture);
 assert.equal(await ports.contextWindowFor('test','test'),100000);
 assert.equal(await ports.contextWindowFor('test','unlisted'),null);
 const returned=await ports.readFallback();returned.model='mutated';
 assert.equal((await ports.readFallback()).model,'fallback');
 await assert.rejects(ports.assertCurrent(),/snapshot|configuration/i);
 assert.equal(await f.db.directorNextEvent.count({where:{type:'production_kernel_model_policy'}}),1);
});
test('expired ownership cannot bind model policy and capture does not dispatch any model',async t=>{
 const f=await fixture(t),s=source(f);
 await f.db.directorNextRunControl.update({where:{runId:f.contract.runId},data:{leaseExpiresAt:new Date(0)}});
 await assert.rejects(f.api.bindKernelModelPolicy(f.db,f.context,s.capture),/lease|ownership/i);
 assert.equal(s.calls(),0);assert.equal(await f.db.directorNextEvent.count(),0);
});
test('model policy rejects unknown windows instead of inferring them from names or output caps',async t=>{
 const f=await fixture(t);let resolutions=0;
 await assert.rejects(()=>f.api.captureKernelModelPolicy(f.contract,{readWindows:()=>[],readFallback:async()=>({...fallback,enabled:false}),
  resolveModel:async()=>{resolutions++;throw Error('should not resolve');}}),/window|上下文/i);
 assert.equal(resolutions,0);
});
test('endpoint, task output, fallback and metadata drift are independently rejected while credential rotation stays ephemeral',async t=>{
 const f=await fixture(t);
 for(const kind of ['endpoint','output','fallback','window','credential']){
  const s=source(f),snapshot=await s.capture(),ports=f.api.createKernelFrozenModelPolicy(snapshot,s.capture);
  await ports.assertCurrent();s.change(kind);
  if(kind==='credential')await ports.assertCurrent();
  else await assert.rejects(ports.assertCurrent(),/snapshot/i);
 }
});
test('explicit environment metadata supplies windows without a provider request or family-name defaults',async t=>{
 const f=await fixture(t),old=process.env.PRODUCTION_KERNEL_MODEL_WINDOWS;
 try{
  process.env.PRODUCTION_KERNEL_MODEL_WINDOWS=JSON.stringify([{provider:'test',model:'test',contextWindow:123456}]);
  const policy=await f.api.captureKernelModelPolicy(f.contract,{readFallback:async()=>({...fallback,enabled:false}),
   resolveModel:async(provider,options)=>({provider,model:options.model,baseURL:'https://invalid.test',temperature:0.3,maxTokens:100,
    taskType:options.taskType})});
  assert.equal(policy.windows[0].contextWindow,123456);
  process.env.PRODUCTION_KERNEL_MODEL_WINDOWS='[]';
  await assert.rejects(()=>f.api.captureKernelModelPolicy(f.contract,{readFallback:async()=>({...fallback,enabled:false})}),/上下文窗口/);
 }finally{if(old===undefined)delete process.env.PRODUCTION_KERNEL_MODEL_WINDOWS;else process.env.PRODUCTION_KERNEL_MODEL_WINDOWS=old;}
});
