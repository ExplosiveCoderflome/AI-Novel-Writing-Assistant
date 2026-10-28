const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./preparation/fixture.cjs');
async function setup(t,fault){
 const f=await fixture(t);assert.equal(typeof f.kernel.createKernelPreparationStage,'function');
 const state={models:0,commits:0,fault,requestVersion:'frozen-v1'};
 const readBaseline=async()=>{const row=await f.db.chapter.findUniqueOrThrow({where:{id:'chapter-1'}});return{content:row.content,updatedAt:row.updatedAt.toISOString(),protectedUserContent:false};};
 const stage=f.kernel.createKernelPreparationStage({purpose:'automatic',checkpoints:f.checkpoints,executionToken:()=> 'lease-1',
   readBaseline,readInput:async()=>({native:'prepared source'}),fence:async()=>{},
   execute:async(run,input,steps)=>{
    const result=await steps.model('contract',{identity:state.requestVersion,input:{full:'model input'},outputTokens:3200},async()=>{
      if(state.fault==='budget'){state.fault=null;throw new (require('../../dist/modules/production/common').ProductionBudgetNotDispatchedError)();}
      if(state.fault==='known_output'){state.fault=null;state.models++;const error=new Error('malformed model output');error.category='malformed_json';throw error;}
      if(state.fault==='quality'){state.fault=null;state.models++;const error=new Error('contract duplicates the previous chapter');error.promptQualityFailureKind='post_validate_failed';throw error;}
      state.models++;if(state.fault==='unknown')throw Error('connection lost after dispatch');return{taskSheet:'核对前文后推进证据'};
    });
    if(state.fault==='after_model'){state.fault=null;throw Error('exit after durable model result');}
    await steps.commit('contract_commit',async tx=>{state.commits++;await tx.chapter.update({where:{id:'chapter-1'},data:{taskSheet:result.taskSheet}});return{saved:true};});
    if(state.fault==='after_commit'){state.fault=null;throw Error('exit after atomic contract commit');}
    return{novelTitle:'测试书',chapterTitle:'测试章',contextPackage:{source:'read-only assembly'}};
   }});
 const descriptor=await stage.describe(f.run),run={...f.run,artifacts:{...f.run.artifacts,activeDescriptor:descriptor}};
 return{...f,stage,run,state,descriptor,execute:()=>stage.execute(run,{...descriptor,requestKey:'prepare-request'})};
}
for(const point of ['after_model','after_commit'])test(`preparation recovers ${point} without repeating the model or business commit`,async t=>{
 const f=await setup(t,point);await assert.rejects(()=>f.execute(),/exit after/);
 const reply=await f.stage.recover(f.run,'prepare-request');assert.equal(reply.result.stage,'prepare');
 assert.equal(f.state.models,1);assert.equal(f.state.commits,1);assert.equal(reply.artifacts.prepared.contextPackage.source,'read-only assembly');
 assert.deepEqual(await f.stage.recover(f.run,'prepare-request'),reply);assert.equal(f.state.models,1);assert.equal(f.state.commits,1);
});
test('unknown preparation request remains claimed and recovery never dispatches it again',async t=>{
 const f=await setup(t,'unknown');await assert.rejects(()=>f.execute(),/connection lost/);
 assert.equal(await f.stage.recover(f.run,'prepare-request'),undefined);assert.equal(f.state.models,1);assert.equal(f.state.commits,0);
});
test('a proven unsent budget rejection releases the claim so recovery can dispatch it',async t=>{
 const f=await setup(t,'budget');await assert.rejects(()=>f.execute(),/budget|dispatch/i);assert.equal(f.state.models,0);
 const reply=await f.stage.recover(f.run,'prepare-request');assert.equal(reply.result.stage,'prepare');
 assert.equal(f.state.models,1);assert.equal(f.state.commits,1);
 assert.deepEqual(await f.stage.recover(f.run,'prepare-request'),reply);assert.equal(f.state.models,1);assert.equal(f.state.commits,1);
});
test('a known structured-output failure releases the preparation claim for recovery',async t=>{
 const f=await setup(t,'known_output');await assert.rejects(()=>f.execute(),/malformed/);assert.equal(f.state.models,1);
 const reply=await f.stage.recover(f.run,'prepare-request');assert.equal(reply.result.stage,'prepare');
 assert.equal(f.state.models,2);assert.equal(f.state.commits,1);
});
test('a semantic rejection releases the preparation claim for recovery',async t=>{
 const f=await setup(t,'quality');await assert.rejects(()=>f.execute(),/duplicates/);assert.equal(f.state.models,1);
 const reply=await f.stage.recover(f.run,'prepare-request');assert.equal(reply.result.stage,'prepare');
 assert.equal(f.state.models,2);assert.equal(f.state.commits,1);
});
test('changed native configuration cannot replace a previously saved preparation request',async t=>{
 const f=await setup(t,'after_model');await assert.rejects(()=>f.execute());f.state.requestVersion='changed-v2';
 await assert.rejects(()=>f.execute(),/snapshot|prepared|request/i);assert.equal(f.state.models,1);assert.equal(f.state.commits,0);
});
test('recovery dispatches a never-attempted model request instead of stalling on it',async t=>{
 const f=await setup(t,null);
 const reply=await f.stage.recover(f.run,'prepare-request');assert.equal(reply.result.stage,'prepare');
 assert.equal(f.state.models,1);assert.equal(f.state.commits,1);
 assert.deepEqual(await f.stage.recover(f.run,'prepare-request'),reply);assert.equal(f.state.models,1);assert.equal(f.state.commits,1);
});
