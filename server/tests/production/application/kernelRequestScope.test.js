const test=require('node:test'),assert=require('node:assert/strict');
const api=require('../../../dist/app/director/productionKernel');
const {claimModelRequest}=require('../../../dist/platform/llm/retries');
const {captureInvocationUsageObserver}=require('../../../dist/platform/llm/usage');
const kernel=require('../../../dist/modules/production');
const unit={novelId:'n',chapterId:'c',order:1};
function fixture(allow=true) {
 assert.equal(typeof api.runKernelRequestScope,'function','physical kernel request scope must be exported');
 const reserved=[],released=[],observed=[];
 return {reserved,released,observed,input:{unit,requestKey:'stage-key',maxRequests:3,reserveTokens:10,fence:async()=>{},
  budget:{reserve:async(_unit,key)=>{if(allow)reserved.push(key);return allow;},observe:async(_unit,key,record)=>observed.push({key,id:record.invocationId}),
   releaseUndispatched:async(_unit,key)=>released.push(key)}}};
}
async function observedCall(id,value=unit) {
 await claimModelRequest();
 await captureInvocationUsageObserver()({invocationId:id,novelId:value.novelId,chapterId:value.chapterId,runId:'r',status:'completed',usage:{totalTokens:5}});
 return 'response';
}
test('physical retry calls bind separate reservations and observations to their own request identities',async()=>{
 const f=fixture();let calls=0;
 const result=await api.runKernelRequestScope(f.input,async()=>{calls++;await observedCall('one');calls++;return observedCall('two')});
 assert.equal(result,'response');assert.equal(calls,2);assert.equal(new Set(f.reserved).size,2);
 assert.deepEqual(f.observed.map(x=>x.key),f.reserved);assert.deepEqual(f.released,[]);
});
test('each physical retry reserves from its actual full request instead of the initial stage estimate',async()=>{
 const f=fixture(),tokens=[];
 f.input.reserveTokens=request=>request.input[0].content.length+10;
 f.input.budget.reserve=async(_unit,_key,amount)=>{tokens.push(amount);return true};
 await api.runKernelRequestScope(f.input,async()=>{
  for(const [index,content]of ['first','different report'].entries()){
   await claimModelRequest({input:[{role:'user',content}]});
   await captureInvocationUsageObserver()({invocationId:'physical-'+index,novelId:'n',chapterId:'c',runId:'r',status:'completed',usage:{totalTokens:5}});
  }
 });
 assert.deepEqual(tokens,[15,26]);
});
test('a denied first physical request proves no dispatch and never enters the model',async()=>{
 const f=fixture(false);let dispatched=false;
 await assert.rejects(()=>api.runKernelRequestScope(f.input,async()=>{await claimModelRequest();dispatched=true;}),{name:'ProductionBudgetNotDispatchedError'});
 assert.equal(dispatched,false);assert.deepEqual(f.observed,[]);
});
test('explicit proof of a retry rejection before dispatch releases only that reservation',async()=>{
 const f=fixture();await api.runKernelRequestScope(f.input,async()=>{await claimModelRequest();await api.markKernelRequestNotDispatched();return 'retry policy declined before dispatch';});
 assert.equal(f.released.length,1);assert.equal(f.released[0],f.reserved[0]);
});
test('missing usage telemetry is not treated as proof that the request was never sent',async()=>{
 const f=fixture();await assert.rejects(()=>api.runKernelRequestScope(f.input,async()=>{await claimModelRequest();return 'unobserved result';}),/usage|observation/i);
 assert.deepEqual(f.released,[]);
});
test('a real failed invocation with unknown usage keeps its reservation and remote uncertainty',async()=>{
 const f=fixture();await assert.rejects(()=>api.runKernelRequestScope(f.input,async()=>{
  await claimModelRequest();await captureInvocationUsageObserver()({invocationId:'failed',novelId:'n',chapterId:'c',runId:'r',status:'failed',usage:null});throw Error('transport result unknown');
 }),/transport result unknown/);assert.equal(f.observed.length,1);assert.deepEqual(f.released,[]);
});
test('an observer persistence failure cannot publish an apparently successful model response',async()=>{
 const f=fixture();f.input.budget.observe=async()=>{throw Error('usage write failed')};
 await assert.rejects(()=>api.runKernelRequestScope(f.input,()=>observedCall('one')),/usage write failed/);
 assert.deepEqual(f.released,[]);
});
test('a unit may retry after a proven pre-dispatch budget rejection but never after a dispatched unknown response',async()=>{
 const {request,harness,hash}=require('./harness.cjs');const f=fixture(false),ports=harness();let allow=false,calls=0;
 f.input.budget.reserve=async()=>allow;
 ports.stages.draft.execute=async(row,call)=>api.runKernelRequestScope({...f.input,unit:row.progress.unit,requestKey:call.requestKey},async()=>{
  await observedCall('draft',row.progress.unit);calls++;return {result:{stage:'draft',contentHash:hash('original')},artifacts:{original:'original'}};
 });
 const first=await kernel.runUnit(request(),ports);assert.equal(first.status,'budget_exhausted');
 assert.equal([...ports.rows.values()][0].activeStage,null);
 allow=true;assert.equal((await kernel.runUnit(request(),ports)).status,'completed');assert.equal(calls,1);
});
