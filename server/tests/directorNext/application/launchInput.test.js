const test=require('node:test');const assert=require('node:assert/strict');
const {CommandService}=require('../../../dist/modules/director/application');
const {contract}=require('../fixtures');
test('launch input is passed to contract construction and saved in the command transaction',async()=>{
 let saved,received;
 const launchInput={storyInput:'故事',estimatedChapterCount:20,temperature:0.4,worldMode:'generate',targetVolumeId:null};
 const service=new CommandService({runRepository:{findActiveRunIdByNovel:async()=>null},commandRepository:{find:async()=>null,openRun:async input=>{saved=input;return {runId:input.runId,control:{version:0},commandId:input.id,replayed:false};}},runtime:{nextId:()=> 'id'},
  contractFactory:input=>{received=input;return contract({...input,launchInput:input.launchInput});}});
 await service.execute({type:'open_run',novelId:'novel',driver:'auto',stepIdsInScope:null,launchInput,idempotencyKey:'open'});
 assert.deepEqual(received.launchInput,launchInput);assert.deepEqual(saved.contract.launchInput,launchInput);
});
test('handoff preserves immutable launch, policy, range, model and plan snapshots',async()=>{
 const original=contract({launchInput:{storyInput:'原故事',estimatedChapterCount:20,worldMode:'reuse'},tokenBudget:900,scope:'volume:v1',chapterRange:{from:3,to:8},issuePolicy:{mode:'quality_first',version:'saved-policy'}});
 let saved;
 const service=new CommandService({runRepository:{getControl:async()=>({version:7,status:'paused'}),getContract:async()=>original},commandRepository:{find:async()=>null,handoff:async input=>{saved=input;return {runId:input.newRunId,control:{version:0},commandId:input.id,replayed:false};}},runtime:{nextId:()=> 'new-id'},contractFactory:()=>{throw new Error('must not rebuild snapshots');}});
 await service.execute({type:'handoff',runId:original.runId,toDriver:'assisted',expectedVersion:7,idempotencyKey:'handoff'});
 assert.deepEqual(saved.newContract,{...original,runId:'new-id',driver:'assisted'});
});
