const test=require('node:test');const assert=require('node:assert/strict');
const {createGateOrchestrator,checkAction}=require('../../dist/modules/director/domain');
const {plan,contract,facts,artifact,runningControl,deepFreeze}=require('./fixtures');
const next=(artifacts=[],extra={})=>createGateOrchestrator().next({plan,contract:contract({driver:'assisted'}),facts:facts(artifacts,extra)});
test('assisted stages open a deterministic gate for unconfirmed products in plan order',()=>{
 const result=next([artifact('novel_seed',{status:'confirmed'}),artifact('story_macro')]);assert.equal(result.kind,'open_gate');assert.deepEqual(result.artifactTypes,['story_macro']);
 assert.deepEqual(next([artifact('story_macro'),artifact('character_cast')]).artifactTypes,['story_macro','character_cast']);
});
test('confirmed dependencies allow generation while unconfirmed dependencies cannot be skipped',()=>{
 assert.deepEqual(next([artifact('novel_seed',{status:'confirmed'})]),{kind:'run_step',stepId:'story_macro'});
 const runContract=contract({driver:'assisted'}),snapshot=facts([artifact('novel_seed',{status:'confirmed'}),artifact('story_macro')]);
 assert.equal(checkAction({action:{kind:'run_step',stepId:'character_cast'},plan,contract:runContract,control:runningControl(),facts:snapshot,tokensUsed:0,rejections:0}).code,'requires_unmet');
});
test('quality debt does not block gates or confirmed completion',()=>{
 const all=[artifact('novel_seed',{status:'confirmed'}),...plan.steps.map(step=>artifact(step.produces,{status:'confirmed'}))];
 assert.deepEqual(next(all,{debts:[{chapterOrder:1,code:'local_patch'}]}),{kind:'complete'});
 assert.equal(next([artifact('story_macro')],{debts:[{chapterOrder:1,code:'local_patch'}]}).kind,'open_gate');
});
test('explicit stop signals retain replan, manual and failure mapping',()=>{
 assert.equal(next([],{stopSignal:{kind:'replan',reason:'replan'}}).pause.kind,'replan');
 assert.equal(next([],{stopSignal:{kind:'manual_recovery',reason:'manual'}}).pause.kind,'manual_recovery');
 assert.equal(next([],{stopSignal:{kind:'safety',reason:'budget'}}).pause.kind,'safety');
 assert.equal(next([],{stopSignal:{kind:'no_usable_content',reason:'empty',action:'fail_task'}}).kind,'fail');
});
test('gate decisions are pure and crash recovery returns the same saved boundary',()=>{
 const input=deepFreeze({plan,contract:contract({driver:'assisted'}),facts:facts([artifact('story_macro')])});
 const before=JSON.stringify(input);const orchestrator=createGateOrchestrator();assert.deepEqual(orchestrator.next(input),orchestrator.next(input));assert.equal(JSON.stringify(input),before);
});
test('missing prerequisites pause and out-of-scope products do not open gates',()=>{
 assert.equal(next().pause.reason,'no_runnable_step');
 const result=createGateOrchestrator().next({plan,contract:contract({driver:'assisted',stepIdsInScope:[]}),facts:facts([artifact('story_macro')])});assert.equal(result.kind,'complete');
});
