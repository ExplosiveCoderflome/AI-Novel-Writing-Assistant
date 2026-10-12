const test=require('node:test');
const assert=require('node:assert/strict');
const {createCharacterSetupStepHandler}=require('../../../dist/modules/director/steps/planning/characterSetup');
const context={runId:'run',contract:{novelId:'novel',scope:'book'}};
const member={id:'hero',novelId:'novel',name:'主角'};
function setup(existing=[],saved=[member]) {
 const calls=[];let reads=0;
 const handler=createCharacterSetupStepHandler({inputProvider:async()=>({storyInput:'故事',model:'model'}),
  characterService:{readCast:async()=>{calls.push('read');return {characters:reads++?saved:existing,relations:[]};},
   prepareEmptyCast:async(novel,input)=>{calls.push(['prepare',novel,input]);return {characterIds:['hero']};}},contentHash:()=> 'hash'});
 return {handler,calls};
}
test('existing cast is protected and reused without generation',async()=>{
 const {handler,calls}=setup([member]);const result=await handler(context);
 assert.deepEqual(calls,['read']);assert.equal(result.artifact.status,'confirmed');assert.equal(result.artifact.protectedUserContent,true);
});
test('empty cast is generated once and persisted identities are verified',async()=>{
 const {handler,calls}=setup();const result=await handler(context);
 assert.equal(calls[1][0],'prepare');assert.equal(calls[1][1],'novel');assert.equal(calls[1][2].storyInput,'故事');
 assert.equal(result.artifact.contentRef,'character_cast:novel');assert.equal(result.artifact.status,'draft');
});
test('cross-book cast fails before generation',async()=>{
 const {handler,calls}=setup([{...member,novelId:'other'}]);await assert.rejects(()=>handler(context));assert.deepEqual(calls,['read']);
});
test('missing or cross-book saved members cause integrity stops',async()=>{
 for(const saved of [[],[{...member,id:'other'}],[{...member,novelId:'other'}]]) {
  const {handler}=setup([],saved);const result=await handler(context);assert.equal(result.stopSignal.kind,'data_integrity');assert.equal(result.artifact,undefined);
 }
});
