const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./preparation/fixture.cjs');
const {createPreparationSteps}=require('../../dist/modules/production/infrastructure/preparation/steps');
const transport=require('../../dist/services/rag/execution');
const api=()=>require('../../dist/app/director/productionKernel/rag');
async function setup(t){
 const f=await fixture(t),target={kind:'embedding',provider:'test',model:'embedding',configurationKey:'target-v1'};
 let configuration={version:1,enabled:true,targets:[target],windows:[{provider:'test',model:'embedding',contextWindow:100000}],retrievalIdentity:'v1'};
 let source='source-v1',allow=true,http=0,afterSend=async()=>{},observed=[];const reservations=[];
 const fence=async()=>{await f.db.$transaction(tx=>f.assertOwnership(tx,{executionToken:'lease-1'}));};
 const deps={run:f.run,runId:'director-test',configuration:structuredClone(configuration),readConfiguration:async()=>configuration,
  readSources:async()=>source,assertIndex:async()=>{},fence,recordUsage:async()=>{},
  budget:{reserve:async(_unit,key,tokens)=>{if(!allow)return false;reservations.push({key,tokens});return true;},
   observe:async(_unit,key,record)=>observed.push({key,record}),releaseUndispatched:async()=>{}}};
 const steps=recoverOnly=>createPreparationSteps({checkpoints:f.checkpoints,executionToken:()=> 'lease-1',fence},f.run,
  {content:f.context.content,updatedAt:new Date(0).toISOString(),protectedUserContent:false},'prepare-request','frozen-source',recoverOnly).steps;
 const request=(attempt=0,input=['query'])=>({...target,input:{model:'embedding',input},attempt});
 const fetchOne=async(desc=request())=>{const response=await transport.scopedRagFetch(desc,async()=>{http++;await afterSend();
  return Response.json({data:[{embedding:[1,2,3]}],usage:{total_tokens:10,prompt_tokens:10}});});return response.json();};
 const run=(operation,recoverOnly=false)=>api().withKernelRagContext({...deps,steps:steps(recoverOnly)},
  ()=>transport.scopedRagRetrieve('query',{novelId:'novel-1'},operation));
 return {...f,deps,request,fetchOne,run,http:()=>http,reservations,observed,
  changeConfig:()=>{configuration={...configuration,retrievalIdentity:'changed'};},changeSource:()=>{source='changed';},
  allow:value=>{allow=value;},afterSend:operation=>{afterSend=operation;}};
}
test('a saved physical result survives an outer context crash without another paid call',async t=>{
 const f=await setup(t);let crash=true;
 const operation=async()=>{const result=await f.fetchOne();if(crash)throw Error('outer assembly interrupted');return result;};
 await assert.rejects(f.run(operation),/outer assembly/);assert.equal(f.http(),1);
 crash=false;const result=await f.run(operation,true);assert.equal(result.data[0].embedding.length,3);assert.equal(f.http(),1);
 assert.equal(f.reservations.length,1);assert.equal(f.observed.length,1);assert.ok(f.reservations[0].tokens>10);
});
test('unknown HTTP outcomes retain the model claim across recovery and never degrade into usable context',async t=>{
 const f=await setup(t);let calls=0;
 const operation=()=>transport.scopedRagFetch(f.request(),async()=>{calls++;throw Error('network outcome unknown');});
 await assert.rejects(f.run(operation),/network outcome unknown/);
 await assert.rejects(f.run(operation,true),/not resolved/);assert.equal(calls,1);
 const running=await f.db.chapterArtifactSyncCheckpoint.findMany({where:{status:'running'}});assert.ok(running.length>0);
});
test('configuration and source drift reject a cached context without a new request',async t=>{
 for(const change of ['changeConfig','changeSource'])await t.test(change,async t=>{
  const f=await setup(t);await f.run(()=>f.fetchOne());f[change]();await assert.rejects(f.run(()=>f.fetchOne(),true),/snapshot|configuration/i);assert.equal(f.http(),1);
 });
});
test('a proven pre-dispatch budget refusal is recoverable only after explicit allowance',async t=>{
 const f=await setup(t);f.allow(false);await assert.rejects(f.run(()=>f.fetchOne()),/预算/);assert.equal(f.http(),0);
 f.allow(true);await f.run(()=>f.fetchOne());assert.equal(f.http(),1);
});
test('each retry and split has an independent durable request and complete-input reservation',async t=>{
 const f=await setup(t);
 await f.run(async()=>{for(const request of [f.request(0,['one','two']),f.request(1,['one','two']),f.request(0,['one']),f.request(0,['two'])])await f.fetchOne(request);return {};});
 assert.equal(f.http(),4);assert.equal(new Set(f.reservations.map(row=>row.key)).size,4);assert.equal(f.observed.length,4);
});
test('loss of ownership after a paid result preserves accounting and prevents context publication',async t=>{
 const f=await setup(t),before=await f.db.productionUnitRun.findUniqueOrThrow({where:{id:f.deps.run.id}});
 f.afterSend(()=>f.revoke());await assert.rejects(f.run(()=>f.fetchOne()),/ownership/);
 assert.equal(f.http(),1);assert.equal(f.observed.length,1);
 const after=await f.db.productionUnitRun.findUniqueOrThrow({where:{id:f.deps.run.id}});
 assert.equal(after.progressJson,before.progressJson);assert.equal(after.stageArtifactsJson,before.stageArtifactsJson);
 assert.equal(after.activeStage,'prepare');assert.ok((await f.db.chapterArtifactSyncCheckpoint.count({where:{status:'running'}}))>0);
});
test('mutating caller configuration cannot authorize a model outside the captured snapshot',async t=>{
 const f=await setup(t);
 await assert.rejects(f.run(async()=>{
  f.deps.configuration.targets[0].model='unapproved';
  f.deps.configuration.windows[0].model='unapproved';
  return f.fetchOne({...f.request(),model:'unapproved',input:{model:'unapproved',input:['query']}});
 }),/snapshot/i);
 assert.equal(f.http(),0);assert.equal(f.reservations.length,0);
});
